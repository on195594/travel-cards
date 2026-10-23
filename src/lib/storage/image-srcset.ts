import type { ImageUpload } from "@/lib/guides/schema";

export function imageSrcSet(image: ImageUpload): string | undefined {
  return image.variants?.map(({ publicUrl, width }) => `${new URL(publicUrl).href.replaceAll(",", "%2C")} ${width}w`).join(", ");
}
