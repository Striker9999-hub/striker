/** SHA-256 of `text` as lowercase hex (Apps Script returns signed bytes). */
export const sha256Hex = (text: string): string =>
  Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, "0"))
    .join("");
