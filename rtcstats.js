let rtcConnections = []
var origPeerConnection = window['RTCPeerConnection'];
var peerconnection = function(config, constraints) {
  var pc = new origPeerConnection(config, constraints);
  rtcConnections.push({pc: pc, stats: {}, num: connections.length});
  return pc;
}

window['RTCPeerConnection'] = peerconnection;
window['RTCPeerConnection'].prototype = origPeerConnection.prototype;https://codepen.io/lamortenera/pen/abmzPNP

const statsDiv = document.createElement('div');
statsDiv.hidden = true;
statsDiv.style.cssText = "position:absolute;z-index:100;top:0;left:0;background-color:lightgray;padding: 4px;";
document.body.appendChild(statsDiv);

window.onkeydown = function(e){
  if (e.keyCode == 81 && e.ctrlKey) statsDiv.hidden = !statsDiv.hidden;  
};

setInterval(() => {
  let statsString = "";
  for (const conn of rtcConnections){
    updateSummary(conn.pc, conn.stats);
    statsString += dumpSummary(conn.stats, `Connection ${conn.num}`);
  }
  statsDiv.innerHTML = statsString;
}, 1000);


function isGoodReport(report){
  return (report.type === "remote-inbound-rtp" && report.kind === "video") || 
        (report.type === "outbound-rtp" && report.mediaType === "video") ||
        (report.type === "inbound-rtp" && report.mediaType === "video");
}

function getCodecs(rtcStats){
  const codecs = {};
  rtcStats.forEach(report => {
    if (report.type === "codec") { codecs[report.id] = report; }
  });
  
  const result = {};
  rtcStats.forEach(report => {
    if (isGoodReport(report)) { 
      if (report.codecId) result[report.type] = codecs[report.codecId];
    }
  });
  return result;
}

function getData(rtcStats){
  const data = {}
  rtcStats.forEach(report => {
    if (isGoodReport(report)){
      const reportData = {}
      for (const key of ["timestamp", "framesPerSecond", "bytesReceived", "bytesSent"]){
        if (report[key]) reportData[key] = report[key];
      }
      data[report.type] = reportData;
    }
  });
  return data;
}

function getBitrates(lastData, newData){
  for (const reportType in newData){
    if (!lastData[reportType]) continue;
    const lastReport = lastData[reportType];
    const newReport = newData[reportType];
    for (const key of ["bytesReceived", "bytesSent"]){
      if (newReport[key] && newReport["timestamp"] && lastReport[key] && lastReport["timestamp"]){
        //console.log("I am here");
        const denom = (newReport["timestamp"] - lastReport["timestamp"]);
        const byteRate = (newReport[key] - lastReport[key])/denom;
        newReport[key+"Rate"] = byteRate;
      }
    }
  }  
}

function dumpSummary(summary, title){
  let statsString = `<h3>${title}</h3>`;
  if (!summary.datas) return statsString;
  const lastStats = summary.datas[summary.datas.length - 1];
  for (const reportType in lastStats){
    statsString += `<h4>${reportType}</h4>`
    if (summary.codecs[reportType]){
      statsString += `<p>Codec: ${JSON.stringify(summary.codecs[reportType].mimeType)}</p>`;
    }
    const lastData = lastStats[reportType];
    for (const key of ["framesPerSecond", "bytesReceivedRate", "bytesSentRate"]){
      if (!lastData[key]) continue;
      statsString += `<p>${key}: ${lastData[key]}</p>`;
      let valueSum = 0;
      let num = 0;
      for (const data of summary.datas){
        if (data[reportType] && data[reportType][key]){
          valueSum += data[reportType][key];
          num += 1;
        }
      }
      statsString += `<p>${key} (avg): ${valueSum/num}</p>`;
    }
  }
  return statsString; 
}

async function updateSummary(pc, summary){
  const rtcStats = await pc.getStats(null);
  if (!summary.codecs) summary.codecs = getCodecs(rtcStats);
  if (!summary.datas) summary.datas = [];
  const lastData = summary.datas.length? summary.datas[summary.datas.length - 1] : undefined;
  const newData = getData(rtcStats);
  if (lastData) getBitrates(lastData, newData);
  summary.datas.push(newData);
  if (summary.datas.length > 20){
    summary.datas.splice(0, summary.datas.length - 20);	
  }  
}
