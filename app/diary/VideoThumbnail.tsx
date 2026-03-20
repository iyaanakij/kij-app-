'use client'

export default function VideoThumbnail({ src, className }: { src: string; className?: string }) {
  return (
    <video
      src={src}
      className={className}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 0.1 }}
    />
  )
}
