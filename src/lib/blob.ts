import { put } from '@vercel/blob';
import { nanoid } from 'nanoid'

export async function uploadToBlob(imageFile: File) {
  const filename = nanoid();
  const fileType = imageFile.type.split("/")[1];
  const blobresult = await put(`uploads/${filename}.${fileType}`, imageFile, {
    access: 'public',
  });
  return { contentType: blobresult.contentType, url: blobresult.url };
}