export interface WocModule {
  readonly HEAPU8: Uint8Array;
  _malloc(length: number): number;
  _free(address: number): void;
  _woc_open(connection: number): void;
  _woc_close(connection: number): void;
  _woc_receive(connection: number, address: number, length: number): void;
  _woc_tick(): void;
  _woc_output_data(): number;
  _woc_output_size(): number;
}

export default function createWoc(options: {
  locateFile: (name: string) => string;
}): Promise<WocModule>;
