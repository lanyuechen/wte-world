const MAX_EDGE = 800
const MAX_BYTES = 500 * 1024
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45]

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

export async function compressImageToJpeg(file: File): Promise<string> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法压缩图片')
  ctx.drawImage(img, 0, 0, width, height)

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const approxBytes = Math.ceil(((dataUrl.length - 22) * 3) / 4)
    if (approxBytes <= MAX_BYTES) return dataUrl
  }

  throw new Error('图片过大，请换一张更小的图（压缩后需小于 500KB）')
}
