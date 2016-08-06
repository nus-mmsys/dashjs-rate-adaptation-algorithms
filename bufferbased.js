import SwitchRequest from '../SwitchRequest.js';
import BufferController from '../../controllers/BufferController.js';
import AbrController from '../../controllers/AbrController.js';
import HTTPRequest from '../../vo/metrics/HTTPRequest.js';
import FactoryMaker from '../../../core/FactoryMaker.js';
import Debug from '../../../core/Debug.js';
import DashAdapter from '../../../dash/DashAdapter.js';
import BufferLevel from '../../vo/metrics/BufferLevel.js';
import MediaPlayerModel from '../../models/MediaPlayerModel.js';


function RunningAvg(config) {

    let context = this.context;
    let log = Debug(context).getInstance().log;
    let dashMetrics = config.dashMetrics;
    let metricsModel = config.metricsModel;
    let bufferMax;
    let mediaPlayerModel;
    let instance,
        throughputArray,
        bitrateArray,
       	av,
        alpha,
        bv,
        rho,
        plusIndex,
        minIndex,
        minusIndex,
        adapter;
    var buffArray = [];
    
    function setup() {
        throughputArray = [];
	minIndex = 0;
	plusIndex = 0;
        minusIndex = 0;
        bitrateArray = [];
        adapter = DashAdapter(context).getInstance();
          
        
    }

    function storeLastRequestThroughputByType(type, lastRequestThroughput) {
        throughputArray[type] = throughputArray[type] || [];
        if (lastRequestThroughput !== Infinity &&
            lastRequestThroughput !== throughputArray[type][throughputArray[type].length - 1]) {
            throughputArray[type].push(lastRequestThroughput);
        }

        
    }


      
    function execute (rulesContext, callback) {
        var downloadTime;
        var bytes;
        var averageThroughput;
        var lastRequestThroughput;
        var mediaInfo = rulesContext.getMediaInfo();
        var mediaType = mediaInfo.type;
        var current = rulesContext.getCurrentValue();
        var metrics = metricsModel.getReadOnlyMetricsFor(mediaType);
        var streamProcessor = rulesContext.getStreamProcessor();
        var abrController = streamProcessor.getABRController();
        var isDynamic = streamProcessor.isDynamic();
        var lastRequest = dashMetrics.getCurrentHttpRequest(metrics);
        var bufferStateVO = (metrics.BufferState.length > 0) ? metrics.BufferState[metrics.BufferState.length - 1] : null;
        var bufferLevelVO = (metrics.BufferLevel.length > 0) ? metrics.BufferLevel[metrics.BufferLevel.length - 1] : null;
        var switchRequest = SwitchRequest(context).create(SwitchRequest.NO_CHANGE, SwitchRequest.WEAK);
        let streamInfo = rulesContext.getStreamInfo();        
        let duration = streamInfo.manifestInfo.duration;
        let tt = adapter.getIndexHandlerTime(rulesContext.getStreamProcessor()).toFixed(3);
        let bestR;
        let N;
        var newQuality;
        var buff = dashMetrics.getCurrentBufferLevel(metrics) ? dashMetrics.getCurrentBufferLevel(metrics) : 0.0;
        let bitrate = mediaInfo.bitrateList.map(b => b.bandwidth);
        let bitrateCount = bitrate.length;
        var rhoArray = [];
        var buffArray = [];
        var rhof = 0;
        var i,j,s,X,minDiff;
        let trackInfo = rulesContext.getTrackInfo();
        let fragmentDuration = trackInfo.fragmentDuration;
        let actBuff,fBuffNow=0,lowRes,upRes;
        let buffInterval;
        mediaPlayerModel = MediaPlayerModel(context).getInstance();
         
      
        if (duration >= mediaPlayerModel.getLongFormContentDurationThreshold()) {
            bufferMax = mediaPlayerModel.getBufferTimeAtTopQualityLongForm();
         } else {
            bufferMax = mediaPlayerModel.getBufferTimeAtTopQuality();
         }

          //dash.js has variable buffer basd on duration of video. Lower and upper reserve are maintained in same ratio of buffer as given n paper
          lowRes = bufferMax * (90/240); 
          upRes = bufferMax * (24/240);
        
     
         actBuff = bufferMax -(lowRes + upRes); //cussion in algo
        
         buffInterval = actBuff/(bitrateCount-1); //as upper and lower reserve is fix
         
         log("--------Buffer Based " + "fragment" + fragmentDuration + " actBuff " + actBuff + " buffInterval " + buffInterval + " bufferMax " + bufferMax + " lowRes " + lowRes + " upRes " +upRes);
 
         for(i=0; i<bitrateCount ; i++)
         {
           buffArray[i] = 0; //initilization 
         }
        
        buffArray[0] =  lowRes;
        buffArray [bitrateCount-1] = bufferMax -upRes;
         
     
        for(i=1; i<bitrateCount-1 ; i++)
         {
           buffArray[i] = i*buffInterval + lowRes;
         }
      
     

       for(i=0; i<bitrateCount ; i++)
         {
           log("--------" + " index " + i + " bitrate " + bitrate[i] + " interval " + buffArray[i]);
         }


        if (!metrics || !lastRequest || lastRequest.type !== HTTPRequest.MEDIA_SEGMENT_TYPE ||
            !bufferStateVO || !bufferLevelVO ) {

            callback(switchRequest);
            return;

        }

        if (lastRequest.trace && lastRequest.trace.length) {
            downloadTime = (lastRequest._tfinish.getTime() - lastRequest.tresponse.getTime()) / 1000;

            bytes = lastRequest.trace.reduce(function (a, b) {
                return a + b.b[0];
            }, 0);

            lastRequestThroughput = Math.round(bytes * 8) / (1000 * downloadTime);
            storeLastRequestThroughputByType(mediaType, lastRequestThroughput);
        }

               
            
      abrController.setAverageThroughput(mediaType, lastRequestThroughput);


  	if (abrController.getAbandonmentStateFor(mediaType) !== AbrController.ABANDON_LOAD) {

        
		    if (bufferStateVO.state === BufferController.BUFFER_LOADED || isDynamic) {
                     
                                 for(i=0; buff>buffArray[i] ; i++)
                                 {
                                   fBuffNow = i;
                                 }                                                         

                                if(minIndex == (bitrateCount-1))
                                {
                                  plusIndex = bitrateCount-1;
                                }
                                else
                                {
                                  plusIndex =  minIndex+1;                             
                                   
                                 }
                                if(minIndex == 0)
                                {
                                  minusIndex = 0;
                                }
                                else
                                {
                                  minusIndex = minIndex-1;
                                }
                           
                                if(buff <= lowRes)
                                {
                                  minIndex = 0;
                                 }
                                 else if(buff >= (actBuff+lowRes))
                                 {
                                   minIndex = bitrateCount-1;
                                  }
                                  else if(fBuffNow >= plusIndex)
                                  {
                                    minIndex = fBuffNow-1;
                                  }
                                 else if(fBuffNow <= minusIndex)
                                   {
                                     minIndex =  fBuffNow+1; 
                                   }
                                

                                 bestR = Math.ceil(bitrate[minIndex]/1000);
                                              
				newQuality = abrController.getQualityForBitrate(mediaInfo, bestR);
                               
                                  log("--------" + " fBuffNow " + fBuffNow + " minIndex " + minIndex + " plusIndex " + plusIndex + " minusIndex " + minusIndex);

                                log('---------:bestr '+ bestR+ ' last d '  + lastRequestThroughput + ' bitrate[newQuality] ' + bitrate[newQuality] );         
                                
                            
                                   


				streamProcessor.getScheduleController().setTimeToLoadDelay(0); // TODO Watch out for seek event - no delay when seeking.!!
				switchRequest = SwitchRequest(context).create(newQuality, SwitchRequest.DEFAULT);
				
                             
        callback(switchRequest);
		    }

		    if (switchRequest.value !== SwitchRequest.NO_CHANGE && switchRequest.value !== current) {
		        log('RunningAvg requesting switch to index: ', switchRequest.value, 'type: ',mediaType, ' Priority: ',
		            switchRequest.priority === SwitchRequest.DEFAULT ? 'Default' :
		                switchRequest.priority === SwitchRequest.STRONG ? 'Strong' : 'Weak', 'Average throughput', Math.round(averageThroughput), 'kbps');
		    }
        }

        
    }




    function reset() {
        setup();
    }

    instance = {
        execute: execute,
        reset: reset
    };

    setup();
    return instance;

}

RunningAvg.__dashjs_factory_name = 'RunningAvg';
export default FactoryMaker.getClassFactory(RunningAvg);
