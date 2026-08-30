/* Hero video configuration.

   Two modes, and the difference matters more than it looks:

   - HERO_VIDEO_MP4: a file we host. Muted, looping, plays inline automatically,
     no third-party branding, no cookie banner, and we control the crop. This is
     what a hero video should be. Pair it with HERO_VIDEO_WEBM for a smaller VP9
     copy, and set HERO_VIDEO_HAS_AUDIO=1 only if the file actually has a track.

   - HERO_VIDEO_YOUTUBE: a video id. Rendered as a click-to-play poster, not an
     autoplaying background. YouTube's iframe cannot be relied on to autoplay on
     iOS Safari, drags in ~600KB of player JS plus tracking cookies before the
     customer has done anything, and shows related-video chrome on pause — which
     on a page whose entire job is one tap is an exit ramp we would be paying to
     install. The facade below loads none of that until someone actually clicks.

   Set HERO_VIDEO_POSTER to a still frame either way. Without one the block is a
   grey rectangle above the fold while the video negotiates, which is worse than
   no video at all. */

const YT_ID = /^[\w-]{11}$/;

function heroConfig() {
  const mp4 = (process.env.HERO_VIDEO_MP4 || '').trim();
  const yt = (process.env.HERO_VIDEO_YOUTUBE || '').trim();
  const poster = (process.env.HERO_VIDEO_POSTER || '').trim();
  const caption = (process.env.HERO_VIDEO_CAPTION || '').trim();

  if (mp4) {
    return {
      mode: 'mp4',
      src: mp4,
      /* Optional VP9 sibling, offered first. Browsers pick the first <source>
         they can decode, so ordering webm ahead of mp4 saves the bytes where it
         is supported and changes nothing where it is not. */
      webm: (process.env.HERO_VIDEO_WEBM || '').trim() || null,
      poster: poster || null,
      caption: caption || null,
      /* Most hero loops are silent, so the sound control is opt-in. Rendering a
         toggle for a track that does not exist is a button that does nothing. */
      hasAudio: /^(1|true|yes)$/i.test(process.env.HERO_VIDEO_HAS_AUDIO || ''),
    };
  }
  if (yt && YT_ID.test(yt)) {
    return {
      mode: 'youtube',
      id: yt,
      /* YouTube's own thumbnail, so a poster is optional in this mode. maxres
         does not exist for every upload; hqdefault always does. */
      poster: poster || `https://i.ytimg.com/vi/${yt}/maxresdefault.jpg`,
      fallbackPoster: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      caption: caption || null,
    };
  }
  return { mode: 'off' };
}

module.exports = { heroConfig };
