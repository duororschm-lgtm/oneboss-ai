declare module 'qrcode/lib/core/qrcode' {
  const mod: {
    create(
      text: string,
      options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; version?: number; maskPattern?: number },
    ): { modules: { size: number; data: Uint8Array } };
  };
  export default mod;
}
