/* Complete a journey through public actions using a temporary host clock. */
module.exports = function finishTravel(ctx) {
  const S=ctx.Session;if(!S.isHost||S.state.phase!=='travel')return;
  const now=ctx.Date.now;let offset=0;ctx.Date.now=()=>now()+offset;
  try {
    for(let guard=0;S.state.phase==='travel'&&guard<12;guard++){
      const j=S.state.travel;
      for(const p of S.alive())S.dispatch({type:'travelReady',journeyId:j.id,beat:j.beat,playerId:p.id});
      if(j.beat===-1)for(const p of S.alive())S.dispatch({type:'travelBoard',journeyId:j.id,playerId:p.id});
      if(j.beat===7)for(const p of S.alive())S.dispatch({type:'travelGather',journeyId:j.id,playerId:p.id});
      offset+=(j.duration+1)*1000;
      S.dispatch({type:'travelTick',journeyId:j.id,authority:true});
    }
    if(S.state.phase==='travel')throw new Error('Travel did not finish');
  }finally{ctx.Date.now=now;}
};
