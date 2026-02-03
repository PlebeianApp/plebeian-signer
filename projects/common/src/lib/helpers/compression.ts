/**
 * Compression helpers using native CompressionStream/DecompressionStream API.
 * Uses deflate algorithm — available in Chrome 80+ and Firefox 113+.
 */

/**
 * Compress a string to a Uint8Array using deflate.
 */
export async function compressString(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(encoded);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/**
 * Decompress a Uint8Array back to a string using deflate.
 */
export async function decompressToString(compressed: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();
  return new Response(ds.readable).text();
}
