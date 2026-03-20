'use client'

import { useEffect, useState, useRef } from 'react'

export default function VideoThumbnail({ src, className }: { src: string; className?: string }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.src = src

    const onSeeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(video, 0, 0)
        canvas.toBlob(blob => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          blobRef.current = url
          setThumbUrl(url)
        }, 'image/jpeg', 0.8)
      } catch {
        // CORS等でcanvasに描けない場合はフォールバック表示
      }
      video.src = ''
    }

    video.addEventListener('loadedmetadata', () => { video.currentTime = 0.5 })
    video.addEventListener('seeked', onSeeked)

    return () => {
      video.src = ''
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    }
  }, [src])

  if (thumbUrl) {
    return <img src={thumbUrl} alt="" className={className} />
  }

  return (
    <div className={`${className} bg-gray-800 flex items-center justify-center`}>
      <span className="text-white text-3xl opacity-60">▶</span>
    </div>
  )
}
