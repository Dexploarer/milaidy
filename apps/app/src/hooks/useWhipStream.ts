/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) streaming hook.
 *
 * Captures the Electron window via desktopCapturer and streams it
 * directly to retake.tv's LiveKit WHIP endpoint — pure WebRTC,
 * no FFmpeg needed.
 *
 * WHIP URL format: https://{livekit-host}/whip/{streamKey}
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface DesktopCaptureSource {
  id: string;
  name: string;
}

interface DesktopCapturerBridge {
  getSources: (options: {
    types: string[];
    thumbnailSize?: { width: number; height: number };
  }) => Promise<DesktopCaptureSource[]>;
}

export interface WhipStreamState {
  active: boolean;
  status: "idle" | "connecting" | "live" | "error";
  error?: string;
}

/**
 * Start a WHIP stream from the Electron window to a LiveKit WHIP endpoint.
 */
export function useWhipStream() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<WhipStreamState>({
    active: false,
    status: "idle",
  });

  const stop = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setState({ active: false, status: "idle" });
  }, []);

  const start = useCallback(
    async (whipUrl: string) => {
      if (state.active) return;
      setState({ active: true, status: "connecting" });

      try {
        // 1. Get the Electron window as a MediaStream via desktopCapturer
        const electron = (
          window as Window & {
            electron?: { desktopCapturer?: DesktopCapturerBridge };
          }
        ).electron;
        const desktopCapturer = electron?.desktopCapturer;
        if (!desktopCapturer) {
          throw new Error("Not running in Electron");
        }

        const sources = await desktopCapturer.getSources({
          types: ["window"],
          thumbnailSize: { width: 1, height: 1 },
        });

        // Find our own Electron window
        const selfSource =
          sources.find(
            (source) =>
              source.name === "Milady" ||
              source.name.includes("Milady") ||
              source.name.includes("Electron"),
          ) || sources[0];

        if (!selfSource) {
          throw new Error("No capture source found");
        }

        console.log(
          `[WHIP] Capturing source: "${selfSource.name}" (${selfSource.id})`,
        );

        const desktopConstraints: MediaTrackConstraints & {
          mandatory: Record<string, string | number>;
        } = {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: selfSource.id,
            maxFrameRate: 15,
          },
        };

        // Get MediaStream from desktopCapturer
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: desktopConstraints,
        });

        streamRef.current = stream;

        // 2. Create PeerConnection and add tracks
        const pc = new RTCPeerConnection({
          iceServers: [], // WHIP servers handle ICE themselves
        });
        pcRef.current = pc;

        // Add video track
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) throw new Error("No video track from desktopCapturer");
        pc.addTrack(videoTrack, stream);

        // Add silent audio track (required by retake.tv)
        const audioCtx = new AudioContext();
        const oscillator = audioCtx.createOscillator();
        const dest = audioCtx.createMediaStreamDestination();
        const gain = audioCtx.createGain();
        gain.gain.value = 0; // silent
        oscillator.connect(gain);
        gain.connect(dest);
        oscillator.start();
        const silentAudioTrack = dest.stream.getAudioTracks()[0];
        pc.addTrack(silentAudioTrack, dest.stream);

        // 3. Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // 4. Wait for ICE gathering to complete
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("ICE gathering timeout")),
            10000,
          );
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            resolve();
          } else {
            pc.addEventListener("icegatheringstatecomplete", () => {
              clearTimeout(timeout);
              resolve();
            });
            // Also listen for the state change event
            pc.addEventListener("icegatheringstatechange", () => {
              if (pc.iceGatheringState === "complete") {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
        });

        const localDescription = pc.localDescription;
        if (!localDescription?.sdp) {
          throw new Error("Failed to create SDP offer");
        }

        // 5. POST offer to WHIP endpoint
        console.log(`[WHIP] Sending offer to ${whipUrl}`);
        const response = await fetch(whipUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: localDescription.sdp,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`WHIP POST failed: ${response.status} ${text}`);
        }

        // 6. Set remote description from answer
        const answerSdp = await response.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        console.log("[WHIP] WebRTC stream established!");
        setState({ active: true, status: "live" });

        // Monitor connection state
        pc.addEventListener("connectionstatechange", () => {
          console.log(`[WHIP] Connection state: ${pc.connectionState}`);
          if (
            pc.connectionState === "failed" ||
            pc.connectionState === "disconnected"
          ) {
            setState({
              active: false,
              status: "error",
              error: `Connection ${pc.connectionState}`,
            });
            stop();
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[WHIP] Stream failed:", message);
        setState({ active: false, status: "error", error: message });
        stop();
      }
    },
    [state.active, stop],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, []);

  return { state, start, stop };
}
