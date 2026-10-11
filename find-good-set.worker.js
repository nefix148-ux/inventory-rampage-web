/** Find-good-set worker: blacklist + min/max filters */
const ELEMENTS=["fire","earth","water","air","light","darkness","magic","neural"];
function normalizeElement(el){if(el==null||el==="")return"neutral";return String(el).toLowerCase()}
function getElement(item){if(!item)return"neutral";if(item.originalElement!=null&&item.originalElement!=="")return normalizeElement(item.originalElement);return normalizeElement(item.element)}
function isNeutral(item){return getElement(item)==="neutral"}
function getPossibleElements(item,allowed){if(!item||isNeutral(item))return allowed.slice();const el=getElement(item);if(!el||el==="neutral")return allowed.slice();return allowed.includes(el)?[el]:[]}
function levelValue(range,currentLevel,levelMax){if(!range)return 0;if(typeof range==="number")return range;const[base,maxV]=range;if(currentLevel<=0||levelMax<=0)return base;return base+((maxV-base)/levelMax)*currentLevel}
function getBoost(item,key){if(!item||!item.boosts)return 1;return item.boosts[key]!==undefined?item.boosts[key]:1}
function calcStats(armor,artifact,weapon,cls,tonicBoosts,tonic,armorEl,artEl,weaponEl){
  let armorVal=0;
  if(armor&&armor.stats&&armor.stats.armor){const lvl=armor.currentLevel!==undefined?armor.currentLevel:(armor.levelMax||0);armorVal=levelValue(armor.stats.armor,lvl,armor.levelMax||0)}
  let ringArmor=0;
  if(artifact&&artifact.stats&&artifact.stats.armor){const lvl=artifact.currentLevel!==undefined?artifact.currentLevel:(artifact.levelMax||0);ringArmor=levelValue(artifact.stats.armor,lvl,artifact.levelMax||0)}
  let totalArmor=armorVal+ringArmor;
  totalArmor*=getBoost(artifact,"armor");totalArmor*=getBoost(weapon,"armor");totalArmor*=getBoost(cls,"armor");totalArmor*=(tonicBoosts&&tonicBoosts.armor)||1;
  const tonicEffects=tonic&&(tonic.effects||tonic.boosts);
  if(tonicEffects&&tonicEffects.armor)totalArmor*=tonicEffects.armor;
  let damageVal=0;
  if(weapon&&weapon.stats&&weapon.stats.damage){
    const lvl=weapon.currentLevel!==undefined?weapon.currentLevel:(weapon.levelMax||0);
    let baseDmg=levelValue(weapon.stats.damage,lvl,weapon.levelMax||0);
    const wEl=weaponEl||getElement(weapon);const aEl=armorEl||getElement(armor);const rEl=artEl||getElement(artifact);
    const weaponSub=(weapon.subType||"").toLowerCase();
    const getElBoost=(it,el)=>{let b=getBoost(it,el);if(b===1)b=getBoost(it,"magic");return b};
    let dmg=baseDmg;
    dmg*=getElBoost(armor,wEl);if(armor&&wEl!=="neutral"&&aEl===wEl)dmg*=1.25;
    dmg*=getElBoost(artifact,wEl);if(artifact&&wEl!=="neutral"&&rEl===wEl)dmg*=1.2;
    dmg*=getElBoost(cls,wEl);dmg*=getBoost(cls,weaponSub);
    let tonMul=1;
    if(weaponSub&&tonicBoosts&&tonicBoosts[weaponSub])tonMul*=tonicBoosts[weaponSub];
    if(wEl!==weaponSub&&tonicBoosts&&tonicBoosts[wEl])tonMul*=tonicBoosts[wEl];
    if(weaponSub!=="magic"&&wEl!=="magic"&&tonicBoosts&&tonicBoosts.magic)tonMul*=tonicBoosts.magic;
    dmg*=tonMul;dmg*=getBoost(armor,weaponSub);dmg*=getBoost(artifact,weaponSub);
    if(tonicEffects&&tonicEffects.magic)dmg*=tonicEffects.magic;
    damageVal=dmg;
  }
  const st=weapon&&weapon.stats||{};
  const extra={speed:(weapon&&weapon.boosts&&weapon.boosts.speed)||(armor&&armor.boosts&&armor.boosts.speed)||1,jumpImpulse:st.knockback||0,explosionRadius:st.explosionRange||0,projectileSpeed:st.flightSpeed||0};
  return{armor:totalArmor,damage:damageVal,...extra};
}
function isBlacklistedName(name,set){return set.has(String(name||"").toLowerCase())}
function passesFilters(stats,filters){if(!filters)return true;const map=[["damage",stats.damage],["armor",stats.armor],["speed",stats.speed],["jumpImpulse",stats.jumpImpulse],["explosionRadius",stats.explosionRadius],["projectileSpeed",stats.projectileSpeed]];for(const[key,val]of map){const f=filters[key];if(!f)continue;if(f.min!=null&&val<f.min)return false;if(f.max!=null&&val>f.max)return false}return true}
self.onmessage=function(e){
  const t0=performance.now();
  const data=e.data||{};
  const{mode="damage",items=[],classes=[],beverages=[],currentBeverage=null,includeUpcoming=true,blacklist={},filters={},topN=30}=data;
  const blItems=new Set((blacklist.items||[]).map(s=>String(s).toLowerCase()));
  const blTonics=new Set((blacklist.tonics||[]).map(s=>String(s).toLowerCase()));
  const blClasses=new Set((blacklist.classes||[]).map(s=>String(s).toLowerCase()));
  const blElements=new Set((blacklist.elements||[]).map(s=>String(s).toLowerCase()));
  const typeOf=it=>(it.type||it.itemType||"").toLowerCase();
  let weapons=items.filter(i=>typeOf(i)==="weapon"||typeOf(i)==="weapons");
  let armors=items.filter(i=>typeOf(i)==="armor"||typeOf(i)==="armors");
  let arts=items.filter(i=>typeOf(i)==="artifact"||typeOf(i)==="artifacts"||typeOf(i)==="ring");
  if(!weapons.length&&!armors.length){weapons=items.filter(i=>i.stats&&i.stats.damage);armors=items.filter(i=>i.stats&&i.stats.armor&&!(i.stats.damage&&i.stats.damage[1]));arts=items.filter(i=>i.subType==="ring"||typeOf(i)==="artifact")}
  weapons=weapons.filter(i=>!isBlacklistedName(i.name||i.id,blItems));
  armors=armors.filter(i=>!isBlacklistedName(i.name||i.id,blItems));
  arts=arts.filter(i=>!isBlacklistedName(i.name||i.id,blItems));
  const classList=(classes||[]).filter(c=>!isBlacklistedName(c.name||c.id||c,blClasses));
  let tonicList=(beverages||[]).filter(t=>!isBlacklistedName(t.name||t.id||t,blTonics));
  if(!weapons.length||!armors.length){self.postMessage({topCombinations:[],totalCombinations:0,durationMs:performance.now()-t0});return}
  const allowedElements=ELEMENTS.filter(el=>!blElements.has(el));
  const results=[];let total=0;
  const classesOrNull=classList.length?classList:[null];
  const tonicsOrNull=tonicList.length?tonicList:[currentBeverage,null].filter((v,i,a)=>a.indexOf(v)===i);
  const artsOrNull=arts.length?arts:[null];
  for(const w of weapons){
    if(!includeUpcoming&&w.isUpcoming)continue;
    const wEls=getPossibleElements(w,allowedElements);if(!wEls.length)continue;
    for(const a of armors){
      if(!includeUpcoming&&a.isUpcoming)continue;
      const aEls=getPossibleElements(a,allowedElements);if(!aEls.length)continue;
      for(const art of artsOrNull){
        if(art&&!includeUpcoming&&art.isUpcoming)continue;
        const artEls=art?getPossibleElements(art,allowedElements):[null];if(art&&!artEls.length)continue;
        for(const cls of classesOrNull){
          for(const ton of tonicsOrNull){
            const tonicBoosts=(ton&&(ton.boosts||ton.effects))||{};
            for(const we of wEls){
              for(const ae of aEls){
                for(const arte of artEls){
                  total++;
                  if(total%2000===0)self.postMessage({progress:total});
                  const stats=calcStats(a,art,w,cls,tonicBoosts,ton,ae,arte,we);
                  if(!passesFilters(stats,filters))continue;
                  const score=mode==="armor"?stats.armor:stats.damage;
                  results.push({weapon:{...w,element:we},armor:{...a,element:ae},artifact:art?{...art,element:arte}:null,class:cls,beverage:ton,stats,score,damage:stats.damage});
                }
              }
            }
          }
        }
      }
    }
  }
  results.sort((x,y)=>y.score-x.score);
  self.postMessage({topCombinations:results.slice(0,topN),totalCombinations:total,durationMs:performance.now()-t0});
};
