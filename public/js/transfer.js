var btnConnect = document.querySelector('#connect');
var btnDisconnect = document.querySelector('#disconnect');
var transferForm = document.querySelector('#transfer-form');
var qrcode = document.querySelector('#qrcode');
var socket = null;
var state = 'init';
var pc = null;
var dc = null;
var room = '';

var roomLink = document.querySelector('#roomLink');

var sendProgress = document.querySelector('#sendProgress');
var receiveProgress = document.querySelector('#receiveProgress');

var sendingFileName = document.querySelector('#sendingFileName');
var receivingFileName = document.querySelector('#receivingFileName');

var sendFileList = document.getElementById('sendFileList');
var receiveFileList = document.getElementById('receiveFileList');
var transferedFileList = document.getElementById('transferedFileList');

var fileInput = document.getElementById('file');
var sendFile = document.getElementById('sendFile');

// 收到的文件
var receiveBuffer = [];
var receiveSize = 0;

// 待接收文件的名称和大小
var receiveFileSize = 0;
var receiveFileName = '';

// 8k  8192
// 16k  16384
// 32k  32768
var chunkSize = 8192;

function getUrlQueryString(name, path) {
  if (!path) {
    path = window.location.search;
  }

  var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  var r = path.substr(1).match(reg);
  if (r != null) {
    return decodeURI(r[2]);
  }
  return null;
}

if (getUrlQueryString('id')) {
  room = getUrlQueryString('id');
} else {
  room = Math.round(Math.random() * 10000);
}

roomLink.setAttribute(
  'href',
  location.origin + location.pathname + '?id=' + room
);
history.pushState(null, '', './?id=' + room);

qrcode.src =
  'https://www.yidiankuaile.com/v1/qrcode?data=' +
  location.href;

roomLink.textContent = room;

transferForm.addEventListener('submit', uploadFile);

// 上传文件
function uploadFile(e) {
  e.preventDefault();
  if (fileInput.files) {
    const fileList = fileInput.files;
    var filereader = new FileReader();
    var fileInfo = {};
    var offset = 0;
    var file = fileList[0];

    fileInfo.size = file.size;
    fileInfo.name = file.name;

    sendingFileName.textContent = file.name;

    console.log('fileInfo', fileInfo);

    // 发送进度最大值：文件大小
    sendProgress.max = file.size;

    // 发送文件信息
    dc.send(JSON.stringify(fileInfo));

    // 文件分片读取
    function readSlice(offset) {
      const slice = file.slice(offset, offset + chunkSize);
      filereader.readAsArrayBuffer(slice);
    }

    // 文件读取后发送到对端
    filereader.onload = function (e) {
      var result = e.target.result;
      dc.send(result);

      offset += e.target.result.byteLength;
      // 发送进度
      sendProgress.value = offset;

      if (offset < file.size) {
        readSlice(offset);
      } else {
        console.log('发送完成');
        var fileItem = document.createElement('li');
        var iEl = document.createElement('i');
        iEl.classList.add('fas', 'fa-cloud-upload-alt');

        fileItem.textContent = ' ' + file.name;
        fileItem.insertBefore(iEl, fileItem.firstChild);
        transferedFileList.appendChild(fileItem);
      }
    };

    readSlice(0);
  } else {
    alert('请选择要发送的文件');
  }
}

function sendSignal(roomid, data) {
  if (socket) {
    socket.emit('signal', roomid, data);
  }
}

// 关闭 peer 连接
function closePeerConnection() {
  if (dc) {
    dc.close();
    dc = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
}

// 用户点击离开
function disconnect() {
  if (socket) {
    socket.emit('leave', room);
  }
  closePeerConnection();
}

function getAnswer(desc) {
  console.log('getAnswer: ', desc);
  pc.setLocalDescription(desc);
  sendSignal(room, desc);
}

function handlerAnserError(err) {
  console.error('handlerAnserError: ', err);
}

// 获取自己的 Offer
function getOffer(desc) {
  pc.setLocalDescription(desc);
  sendSignal(room, desc);
}
function handleOfferError(err) {
  console.log('handleOfferError: ', err);
}

// 只能发起端调用
function call() {
  if (state === 'joined_conn') {
    if (pc) {
      var options = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1,
      };
      pc.createOffer(options).then(getOffer).catch(handleOfferError);
    }
  }
}

function recevemsg(e) {
  // var msg = e.data;
  if (typeof e.data === 'string') {
    var fileInfo = JSON.parse(e.data);
    receiveFileSize = fileInfo.size;
    receiveFileName = fileInfo.name;
    receivingFileName.textContent = fileInfo.name;

    // 接收进度最大值：文件大小
    receiveProgress.max = fileInfo.size;
    return;
  }

  receiveBuffer.push(e.data);
  receiveSize += e.data.byteLength;

  // 接收进度
  receiveProgress.value = receiveSize;

  if (receiveSize === receiveFileSize) {
    receiveSize = 0;
    receiveFileSize = 0;
    var blob = new Blob(receiveBuffer);
    var link = window.URL.createObjectURL(blob);
    var fileItem = document.createElement('li');

    var iEl = document.createElement('i');
    iEl.classList.add('fas', 'fa-cloud-download-alt');
    fileItem.appendChild(iEl);
    transferedFileList.appendChild(fileItem);

    var aDownload = document.createElement('a');

    aDownload.href = link;
    aDownload.textContent = ' ' + receiveFileName;
    aDownload.setAttribute('download', receiveFileName);

    fileItem.appendChild(aDownload);
    transferedFileList.appendChild(fileItem);
  }
}

function dataChannelStateChange(e) {
  if (e.type === 'open') {
    showConnectStatus('success', '已连接');
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-flex';
    sendFile.disabled = false;
  } else if (e.type === 'close') {
    btnConnect.style.display = 'inline-flex';
    btnDisconnect.style.display = 'none';
    showConnectStatus('warning', '未连接');
    sendFile.disabled = true;
  }
}

// 创建 Peer 连接
function createPeerConnection() {
  console.log('create RTCPeerConnection', pc);
  if (!pc) {
    var config = {
      iceServers: [
        {
          urls: ['stun:stun.oonnnoo.com:3478'],
        },
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: '0',
    };
    pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        // 发送 candidate 信息
        sendSignal(room, {
          type: 'candidate',
          label: e.candidate.sdpMLineIndex,
          id: e.candidate.sdpMid,
          candidate: e.candidate.candidate,
        });
      }
    };

    pc.ondatachannel = (e) => {
      if (!dc) {
        dc = e.channel;
        dc.onmessage = recevemsg;
        dc.onopen = dataChannelStateChange;
        dc.onclose = dataChannelStateChange;
      }
    };
  } else {
    console.log('the pc has created');
  }
}

// 连接信令服务器
function connect() {
  socket = io.connect();

  socket.on('joined', (roomid, socketid) => {
    console.log('joined message : ', roomid, socketid);
    state = 'joined';
    createPeerConnection();
    showConnectStatus('success', '等待对方连接');
  });

  socket.on('otherjoined', (roomid, socketid) => {
    showConnectStatus('success', '对方正在连接');
    console.log('otherjoined message : ', roomid, socketid);

    if (state === 'joined_unbind') {
      // 创建连接绑定
      createPeerConnection();
    }
    state = 'joined_conn';

    dc = pc.createDataChannel('chat', {});
    dc.onmessage = recevemsg;
    dc.onopen = dataChannelStateChange;
    dc.onclose = dataChannelStateChange;
    call();

    console.log('otherjoined message state: ', state, dc);
  });

  socket.on('full', (roomid, socketid) => {
    console.log('full message : ', roomid, socketid);
    state = 'leaved';
    socket.disconnect();
    alert('该房间已满');
  });

  socket.on('leaved', (roomid, socketid) => {
    console.log('leaved message : ', roomid, socketid);
    state = 'leaved';
    socket.disconnect();
    btnConnect.style.display = 'inline-flex';
    btnDisconnect.style.display = 'none';
    showConnectStatus('warning', '未连接');
  });

  // 收到媒体协商信令消息
  socket.on('signal', (roomid, data) => {
    // 媒体协商信息
    if (data) {
      if (data.type === 'offer') {
        // 被呼叫方
        pc.setRemoteDescription(new RTCSessionDescription(data));
        pc.createAnswer().then(getAnswer).catch(handlerAnserError);
      } else if (data.type === 'answer') {
        // 呼叫方
        pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === 'candidate') {
        var candidate = new RTCIceCandidate({
          sdpMLineIndex: data.label,
          candidate: data.candidate,
        });
        pc.addIceCandidate(candidate);
      } else {
        console.error('the message is invalid');
      }
    }
  });

  socket.emit('join', room);
}
function getUrlQueryString(name, path) {
  if (!path) {
    path = window.location.search;
  }
  var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  var r = path.substr(1).match(reg);
  if (r != null) {
    return decodeURI(r[2]);
  }
  return null;
}

if (getUrlQueryString('id')) {
  btnConnect.style.display = 'none';
  btnDisconnect.style.display = 'inline-flex';
  connect();
}
// 加入
btnConnect.addEventListener('click', function () {
  btnConnect.style.display = 'none';
  btnDisconnect.style.display = 'inline-flex';
  connect();
});

// 离开
btnDisconnect.addEventListener('click', function () {
  btnConnect.style.display = 'inline-flex';
  btnDisconnect.style.display = 'none';
  showConnectStatus('warning', '未连接');
  disconnect();
});

function showConnectStatus(type, massage) {
  var span = document.createElement('span');
  span.classList.add('tag');
  if (type === 'warning') {
    span.classList.add('is-warning');
  }
  if (type === 'info') {
    span.classList.add('is-info');
  }
  if (type === 'success') {
    span.classList.add('is-success');
  }
  span.textContent = massage;
  document.getElementById('connect-status').innerHTML = span.outerHTML;
  return span;
}
