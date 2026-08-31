import { useMemo, useSyncExternalStore } from "react";
import { type Credentials } from "webrtsp.ts/Types"

export interface WebRTSPHash {
    uri: string;
    credentials?: Credentials;
}

export function useWebRTSPHash(): WebRTSPHash | undefined  {
    const hash = useSyncExternalStore(
        (callback: () => void) => {
            window.addEventListener('hashchange', callback);
            return () => {
                window.removeEventListener('hashchange', callback)
            };
        },
        () => window.location.hash,
        () => "");

    return useMemo((): WebRTSPHash | undefined => {
        if(!hash)
            return undefined;

        let credentials: string | undefined;
        let uri: string | undefined;

        const atPos = hash.indexOf('@');
        if(atPos < 0) {
            uri = hash.substring(1);
            return { uri: decodeURI(uri) };
        } else {
            credentials = hash.substring(1, atPos);
            uri = hash.substring(atPos + 1);
        }

        let userName: string | undefined;
        let accessToken: string;

        const colonPos = credentials.indexOf(':');
        if(colonPos < 0) {
            accessToken = credentials;
        } else {
            userName = credentials.substring(0, colonPos);
            accessToken = credentials.substring(colonPos + 1);
        }

        return {
            uri: decodeURI(uri),
            credentials: {
                userName: userName ? decodeURIComponent(userName) : userName,
                accessToken: decodeURIComponent(accessToken),
            },
        };
    }, [hash]);
}
