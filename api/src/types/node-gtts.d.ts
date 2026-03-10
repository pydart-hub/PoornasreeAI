declare module "node-gtts" {
  interface GTTS {
    stream(text: string): NodeJS.ReadableStream;
    save(filepath: string, text: string, callback?: (err: Error | null) => void): void;
  }
  function gtts(lang: string): GTTS;
  export = gtts;
}
