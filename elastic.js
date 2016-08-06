import SwitchRequest from '../SwitchRequest.js';
import BufferController from '../../controllers/BufferController.js';
import AbrController from '../../controllers/AbrController.js';
import HTTPRequest from '../../vo/metrics/HTTPRequest.js';
import FactoryMaker from '../../../core/FactoryMaker.js';
import Debug from '../../../core/Debug.js';
import DashAdapter from '../../../dash/DashAdapter.js';
import BufferLevel from '../../vo/metrics/BufferLevel.js';
import MediaPlayerModel from '../../models/MediaPlayerModel.js';
import PlaybackController from '../../controllers/PlaybackController.js';

function RunningAvg(config) {

    let context = this.context;
    let log = Debug(context).getInstance().log;
    let dashMetrics = config.dashMetrics;
    let metricsModel = config.metricsModel;
    let bufferMax;
    let mediaPlayerModel, playbackController;
    let instance,
        throughputArray,
        fragmentDict,
        throughputTimeArray,
        rho,
        av,
        adapter;
  
    
    function setup() {
        throughputArray = [];
        throughputTimeArray = [];
        fragmentDict = {};
        adapter = DashAdapter(context).getInstance();
                 
        
    }

     function setFragmentRequestDict(type, id) {
        fragmentDict[type] = fragmentDict[type] || {};
        fragmentDict[type][id] = fragmentDict[type][id] || {};
    }

     function storeLastRequestThroughputByType(type, lastRequestThroughput) {
        throughputArray[type] = throughputArray[type] || [];
        throughputTimeArray[type] = throughputTimeArray[type] || [];
        if (lastRequestThroughput !== Infinity &&
            lastRequestThroughput !== throughputArray[type][throughputArray[type].length - 1]) {
            throughputArray[type].push(lastRequestThroughput);
            throughputTimeArray[type].push(new Date().getTime());
        }

        
    }



      
     function averageThroughputByType(type) {
        var arrThroughput = throughputArray[type];
        var arrTimeThroughput = throughputTimeArray[type];
        var lenThroughput = arrThroughput.length;
        var mNorm,mInst;
        let sumT = 0;
        let avgT = 0;
           
         log ('@@@@@@@@av old@@@@@ ' + av + 'old throughput' + arrThroughput[lenThroughput-1]);
         if (lenThroughput <2) {
             av = arrThroughput[lenThroughput-1];
        }
 
        else if(lenThroughput == 2){
           av=(arrThroughput[0] +arrThroughput[1])/2;
        } 
      
       else{
          
              av= (arrThroughput[lenThroughput-1] +arrThroughput[lenThroughput-2]+ arrThroughput[lenThroughput-3])/3;
               
          
          }

           log ('@@@@@@@@av@@@@@ ' + av ); 
           return (av); 
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
        var fragmentInfo;
        var newQuality;
        var buff = dashMetrics.getCurrentBufferLevel(metrics) ? dashMetrics.getCurrentBufferLevel(metrics) : 0.0;
        let bitrate = mediaInfo.bitrateList.map(b => b.bandwidth);
        let bitrateCount = bitrate.length;
        var rhoArray = [];
        var buffArray = [];
        var rhof = 0;
        var i,j,s,X,buffI,play,d;
        let trackInfo = rulesContext.getTrackInfo();
        let fragmentDuration = trackInfo.fragmentDuration;
        mediaPlayerModel = MediaPlayerModel(context).getInstance();
        playbackController = PlaybackController(context).getInstance();

        if (duration >= mediaPlayerModel.getLongFormContentDurationThreshold()) {
            bufferMax = mediaPlayerModel.getBufferTimeAtTopQualityLongForm();
         } else {
            bufferMax = mediaPlayerModel.getBufferTimeAtTopQuality();
         }

         
     
          play = playbackController.isPaused();
  
          if (play == false)
          {
            d=1;
          }
          else
          {
            d=0;
           }
       
           log("--------ELASTIC " + fragmentDuration + " pause " + play + " d " + d );
       
          



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

  

          av=averageThroughputByType(mediaType);
       
            
         abrController.setAverageThroughput(mediaType, lastRequestThroughput);
 
         buffI = buff + (downloadTime * fragmentDuration);

         bestR = (lastRequestThroughput/(d-(0.01*buff)-(0.001*buffI)));


  	if (abrController.getAbandonmentStateFor(mediaType) !== AbrController.ABANDON_LOAD) {

        
		    if (bufferStateVO.state === BufferController.BUFFER_LOADED || isDynamic) {
                     
                                                           
				newQuality = abrController.getQualityForBitrate(mediaInfo, bestR);
                                                       

                                log('---------:bestr '+ bestR+ ' last d '  + lastRequestThroughput + ' bitrate[newQuality] ' + bitrate[newQuality] + " buffI " +buffI);                                  
                            
				streamProcessor.getScheduleController().setTimeToLoadDelay(0); // TODO Watch out for seek event - no delay when seeking.!!
				switchRequest = SwitchRequest(context).create(newQuality, SwitchRequest.DEFAULT);
				
                             
        callback(switchRequest);
		    }

		    if (switchRequest.value !== SwitchRequest.NO_CHANGE && switchRequest.value !== current) {
		        log('ELASTIC requesting switch to index: ', switchRequest.value, 'type: ',mediaType, ' Priority: ',
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
