import React, { Component } from "react";

import io from "socket.io-client";
import Video from "./components/Video";
import PeerVideos from "./components/PeerVideos";
import Draggable from "./components/draggable";

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      localStream: null, // used to hold local stream object to avoid recreating the stream everytime a new offer comes
      remoteStream: null, // used to hold remote stream object that is displayed in the main screen

      remoteStreams: [], // holds all Video Streams (all remote streams)
      peerConnections: {}, // holds all Video Streams (all remote streams)
      selectedVideo: null,

      status: "Please wait...",
      pc_config: {
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302",
          },
        ],
      },
      sdpConstraints: {
        mandatory: {
          OfferToReceiveAudio: true,
          OfferToReceiveVideo: true,
        },
      },
    };

    this.serviceIP = "https://8dfc-197-210-76-22.ngrok-free.app/webrtcPeer";

    this.socket = null;
  }

  componentDidMount = () => {
    this.socket = io.connect(
      this.serviceIP,

      {
        path: "/webrtcapp",
        query: {
          room: window.location.pathname,
        },
      }
    );

    this.socket.on("connection-success", (data) => {
      this.getLocalStream();
      console.log(data.success);
      const status =
        data.peerCount > 0
          ? `Total Connected Peers to room ${window.location.pathname}: ${data.peerCount}`
          : "Waiting for other peers to connect...";

      this.setState({
        status: status,
      });
    });

    this.socket.on("joined-peers", (data) => {
      this.setState({
        status:
          data.peerCount > 1
            ? `Total Connected Peers to room ${window.location.pathname}: ${data.peerCount}`
            : "Waiting for other peers to connect",
      });
    });

    this.socket.on("peer-disconnected", (data) => {
      console.log("peer-disconnected", data);
      const remoteStreams = this.state.remoteStreams.filter(
        (stream) => stream.id !== data.socketID
      );

      this.setState((prevState) => {
        const selectedVideo =
          prevState.selectedVideo.id === data.socketID && remoteStreams.length
            ? { selectedVideo: remoteStreams[0] }
            : null;

        return {
          remoteStreams,
          ...selectedVideo,
          status:
            data.peerCount > 1
              ? `Total Connected Peers to room ${window.location.pathname}: ${data.peerCount}`
              : "Waiting for other peers to connect",
        };
      });
    });

    this.socket.on("online-peer", (socketID) => {
      console.log("connected peers....", socketID);
      // create and send offer to the peer(data.socketID)
      //1. create new pc
      this.createPeerConnection(socketID, (pc) => {
        //2. create offer
        if (pc) {
          //sending channel

          pc.createOffer(this.state.sdpConstraints).then((sdp) => {
            pc.setLocalDescription(sdp);
            this.sendToPeer("offer", sdp, {
              local: this.socket.id,
              remote: socketID,
            });
          });
        }
      });
    });

    this.socket.on("offer", (data) => {
      this.createPeerConnection(data.socketID, (pc) => {
        pc.addStream(this.state.localStream);

        pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
          () => {
            //2.create answer
            pc.createAnswer(this.state.sdpConstraints).then((sdp) => {
              pc.setLocalDescription(sdp);

              this.sendToPeer("answer", sdp, {
                local: this.socket.id,
                remote: data.socketID,
              });
            });
          }
        );
      });
    });

    this.socket.on("answer", (data) => {
      const pc = this.state.peerConnections[data.socketID];

      pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(
        () => {}
      );
    });
    this.socket.on("candidate", (data) => {
      // get remote's peerConnection
      const pc = this.state.peerConnections[data.socketID];

      if (pc) pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
  };
  getLocalStream = () => {
    const success = (stream) => {
      window.localStream = stream;

      this.setState({ localStream: stream });
      this.whoisOnline();
    };

    const constraints = {
      audio: true,
      video: true,
      options: {
        mirror: true,
      },
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(success)
      .catch((error) => {
        console.error("getUserMedia Error: " + error.name, error);
      });
  };
  whoisOnline = () => {
    //let all peers know when someone is joining
    this.sendToPeer("onlinePeers", null, { local: this.socket.id });
  };

  sendToPeer = (messageType, payload, socketID) => {
    this.socket.emit(messageType, {
      socketID,
      payload,
    });
  };

  createPeerConnection = (socketID, callback) => {
    try {
      let pc = new RTCPeerConnection(this.state.pc_config);
      //add pc to peerconnection object
      // const peerConnections = { ...this.state.peerConnections, [socketID]: pc };
      // this.setState({ peerConnections });
      this.setState((prevState) => ({
        peerConnections: { ...prevState.peerConnections, [socketID]: pc },
      }));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.sendToPeer("candidate", e.candidate, {
            local: this.socket.id,
            remote: socketID,
          });
        }
      };
      pc.oniceconnectionstatechange = (e) => {
        // if (pc.iceConnectionState === "disconnected") {
        //   const remoteStreams = this.state.remoteStreams.filter(
        //     (stream) => stream.id !== socketID
        //   );
        //   this.setState({
        //     remoteStream:
        //       (remoteStreams.length > 0 && remoteStreams[0].strean) || null,
        //   });
        // }
      };
      pc.ontrack = (e) => {
        let _remoteStream = null;
        let remoteStreams = this.state.remoteStreams;
        let remoteVideo = {};
        //checks if stream already exists in remoteStreams
        const rVideos = this.state.remoteStreams.filter(
          (stream) => stream.id === socketID
        );

        //if it does exist then add track
        if (rVideos.length) {
          _remoteStream = rVideos[0].stream;
          _remoteStream.addTrack(e.track, _remoteStream);
          remoteVideo = {
            ...rVideos[0],
            stream: _remoteStream,
          };
          remoteStreams = this.state.remoteStreams.map((_remoteVideo) => {
            return (
              (_remoteVideo.id === remoteVideo.id && remoteVideo) ||
              _remoteVideo
            );
          });
        } else {
          //if it doesnt, then create new stram and add track
          _remoteStream = new MediaStream();
          _remoteStream.addTrack(e.track, _remoteStream);

          remoteVideo = {
            id: socketID,
            name: socketID,
            stream: _remoteStream,
          };
          remoteStreams = [...this.state.remoteStreams, remoteVideo];
        }

        this.setState((prevState) => {
          //if we already have a stream in display let it stay the same, otherwise use the latest stream

          const remoteStream =
            prevState.remoteStreams.length > 0
              ? {}
              : { remoteStream: _remoteStream };
          //get currently selected video
          let selectedVideo = prevState.remoteStreams.filter(
            (stream) => stream.id === prevState.selectedVideo.id
          );
          //if the video is still in the list, then do nothing, otherwise set to new video stream
          selectedVideo = selectedVideo.length
            ? {}
            : { selectedVideo: remoteVideo };
          return {
            ...selectedVideo,

            ...remoteStream,
            remoteStreams,
          };
        });
      };
      pc.close = () => {
        /*alert('Gone') */
      };
      // if (this.state.localStream) pc.addStream(this.state.localStream);
      if (this.state.localStream)
        this.state.localStream.getTracks().forEach((track) => {
          pc.addTrack(track, this.state.localStream);
        });
      // return pc;
      callback(pc);
    } catch (e) {
      console.log("Something went wrong! pc not created!", e);
      // return;
      callback(null);
    }
  };

  switchVideo = (_video) => {
    console.log(_video);
    this.setState({
      selectedVideo: _video,
    });
  };

  render() {
    // console.log(this.state.localStream);
    // if (this.state.disconnected) {
    //   this.socket.close();
    //   this.state.localStream.getTracks().forEach((track) => track.stop());
    //   return <div>You have successfully disconnected from the stream</div>;
    // }
    const statusText = (
      <div style={{ color: "yellow", padding: 5 }}>{this.state.status}</div>
    );
    return (
      <div>
        <Draggable
          style={{
            zIndex: 101,
            position: "absolute",
            right: 0,
            cursor: "move",
          }}
        >
          <Video
            videoStyles={{
              // zIndex: 2,
              // position: "absolute",
              // right: 0,
              width: 200,
              // height: 200,
              // margin: 5,
              // backgroundColor: "black",
            }}
            frameStyle={{
              width: 200,
              margin: 5,
              borderRadius: 5,
              backgroundColor: "black",
            }}
            showMuteControls={true}
            videoStream={this.state.localStream}
            autoPlay
            muted
          ></Video>
        </Draggable>
        <Video
          videoStyles={{
            zIndex: 1,
            position: "fixed",
            bottom: 0,
            minWidth: "100%",
            minHeight: "100%",
            backgroundColor: "black",
          }}
          videoStream={
            this.state.selectedVideo && this.state.selectedVideo.stream
          }
          autoPlay
          // muted
        ></Video>
        <br />

        <div
          style={{
            zIndex: 3,
            position: "absolute",
            // margin: 10,
            // backgroundColor: "#cdc4ff4f",
            // padding: 10,
            // borderRadius: 5,
          }}
        >
          <div
            style={{
              margin: 10,
              backgroundColor: "#cdc4ff4f",
              padding: 10,
              borderRadius: 5,
            }}
          >
            {statusText}
          </div>
        </div>
        <div>
          <PeerVideos
            switchVideo={this.switchVideo}
            remoteStreams={this.state.remoteStreams}
          ></PeerVideos>
        </div>
        <br />
      </div>
    );
  }
}

export default App;
