async function fetchTwitchData(vodID) {
    const resp = await fetch("https://api.twitch.tv/kraken/videos/" + vodID, {
        method: 'GET',
        headers: {
            'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    });

    return resp.json();
}

function createServingID() {
    const w = "0123456789abcdefghijklmnopqrstuvwxyz".split("");
    let id = "";

    for (let i = 0; i < 32; i++) {
        id += w[Math.floor(Math.random() * w.length)];
    }

    return id;
}

const oldFetch = self.fetch;

self.fetch = async function (url, opt) {
    let response = await oldFetch(url, opt);

    console.log("url: ", url);
    console.log("opt: ", opt);

    // Patch playlist from unmuted to muted segments
    if (url.includes("cloudfront") && url.includes(".m3u8")) {
        const body = await response.text();

        return new Response(body.replace(/-unmuted/g, "-muted"), { status: 200 });
    }

    if (url.startsWith("https://usher.ttvnw.net/vod/")) {
        if (response.status != 200) {
            const vodId = url.split("https://usher.ttvnw.net/vod/")[1].split(".m3u8")[0];
            const data = await fetchTwitchData(vodId);

            if (data == undefined) {
                return new Response("Unable to fetch twitch data API", 403);
            }

            let resolutions = data.resolutions;

            let sorted_dict = Object.keys(resolutions);
            sorted_dict = sorted_dict.reverse();

            let ordered_resolutions = {};

            for (key in sorted_dict) {
                ordered_resolutions[sorted_dict[key]] = resolutions[sorted_dict[key]];
            }

            resolutions = ordered_resolutions;

            const currentURL = new URL(data.animated_preview_url);

            const domain = currentURL.host;
            const paths = currentURL.pathname.split("/");
            const vodSpecialID = paths[paths.findIndex(element => element.includes("storyboards")) - 1];

            let fakePlaylist = `#EXTM3U
#EXT-X-TWITCH-INFO:ORIGIN="s3",B="false",REGION="EU",USER-IP="127.0.0.1",SERVING-ID="${createServingID()}",CLUSTER="cloudfront_vod",USER-COUNTRY="BE",MANIFEST-CLUSTER="cloudfront_vod"`;
            let sources_ = [];

            switch (data.broadcast_type) {
                case "highlight":
                    for ([resKey, resValue] of Object.entries(resolutions)) {
                        sources_.push({
                            src: `https://${domain}/${vodSpecialID}/${resKey}/highlight-${vodId}.m3u8`,
                            quality: resKey == "chunked" ? resValue.split("x")[1] + "p" : resKey,
                            resolution: resValue,
                            fps: Math.ceil(data.fps[resKey]),
                            enabled: resKey == "chunked" ? "YES" : "NO"
                        });
                    };

                    break;
                case "upload":
                    for ([resKey, resValue] of Object.entries(resolutions)) {
                        sources_.push({
                            src: `https://${domain}/${data.channel.name}/${vodId}/${vodSpecialID}/${resKey}/index-dvr.m3u8`,
                            quality: resKey == "chunked" ? resValue.split("x")[1] + "p" : resKey,
                            resolution: resValue,
                            fps: Math.ceil(data.fps[resKey]),
                            enabled: resKey == "chunked" ? "YES" : "NO"
                        });
                    };

                    break;
                default:
                    for ([resKey, resValue] of Object.entries(resolutions)) {
                        sources_.push({
                            src: `https://${domain}/${vodSpecialID}/${resKey}/index-dvr.m3u8`,
                            quality: resKey == "chunked" ? resValue.split("x")[1] + "p" : resKey,
                            resolution: resValue,
                            fps: Math.ceil(data.fps[resKey]),
                            enabled: resKey == "chunked" ? "YES" : "NO"
                        });
                    }
                    break;
            }

            let startQuality = 8534030;

            Object.entries(sources_).forEach(([_, value]) => {
                fakePlaylist += `
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="${value.quality}",NAME="${value.quality}",AUTOSELECT=${value.enabled},DEFAULT=${value.enabled}
#EXT-X-STREAM-INF:BANDWIDTH=${startQuality},CODECS="avc1.64002A,mp4a.40.2",RESOLUTION=${value.resolution},VIDEO="${value.quality}",FRAME-RATE=${value.fps}
${value.src}`;

                startQuality -= 100;
            });

            const header = new Headers();
            header.append('Content-Type', 'application/vnd.apple.mpegurl');

            return new Response(fakePlaylist, { status: 200, headers: header });
        }
    }

    return response;
}