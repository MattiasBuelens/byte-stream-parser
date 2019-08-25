export interface ArrayBufferViewConstructor<T extends ArrayBufferView = ArrayBufferView> {
    new(buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number): T;

    readonly BYTES_PER_ELEMENT?: number;
}

/**
 * @param <O> The type of output chunks.
 * @param <I> The type of input byte chunks for the parser. Defaults to {@code Uint8Array}.
 */
export abstract class ByteStreamParser<O, I extends ArrayBufferView = Uint8Array>
    implements Transformer<Uint8Array, O> {

    private readonly _byteChunkConstructor!: ArrayBufferViewConstructor<I>;
    protected _controller!: TransformStreamDefaultController<O>;
    private _iterator!: Generator<void, void, Uint8Array>;
    private _nextBytes: number = 0;
    private _nextBuffer: Uint8Array | undefined = undefined;
    private _nextOffset: number = 0;
    private _lastChunk: Uint8Array = new Uint8Array(0);

    constructor(byteChunkConstructor: ArrayBufferViewConstructor<I>) {
        this._byteChunkConstructor = byteChunkConstructor;
    }

    start(controller: TransformStreamDefaultController<O>): void {
        this._controller = controller;
        this._iterator = this._run();
        void this._iterator.next();
    }

    transform(chunk: Uint8Array): void {
        void this._iterator.next(chunk);
    }

    flush(): void {
        this._iterator.return();
    }

    protected abstract parse_(): Iterator<number, O, I>;

    private _consume(chunk: Uint8Array) {
        if (chunk.byteLength === 0) {
            return;
        }
        const neededBytes = this._nextBytes - this._nextOffset;
        const usableBytes = Math.min(chunk.byteLength, neededBytes);
        if (chunk.byteLength < neededBytes) {
            // Not done yet
            // Copy entire chunk
            if (!this._nextBuffer) {
                this._nextBuffer = new Uint8Array(this._nextBytes);
            }
            this._nextBuffer.set(chunk, this._nextOffset);
        } else {
            // Got everything
            // Use part of chunk and store remainder
            if (!this._nextBuffer) {
                this._nextBuffer = chunk.subarray(0, usableBytes);
            } else {
                this._nextBuffer.set(chunk.subarray(0, usableBytes), this._nextOffset);
            }
        }
        this._nextOffset += usableBytes;
        this._lastChunk = chunk.subarray(usableBytes);
    }

    private* _run(): Generator<void, void, Uint8Array> {
        let caughtError: { _error: any } | undefined;
        try {
            while (true) {
                let parser = this.parse_();
                let result: IteratorResult<number, O> | undefined;
                try {
                    // console.assert(this._lastChunk.byteLength === 0);
                    result = parser.next();
                    while (!result.done) {
                        this._nextBytes = result.value;
                        this._nextBuffer = undefined;
                        this._nextOffset = 0;

                        // Copy bytes from last chunk
                        this._consume(this._lastChunk);

                        // Copy bytes from new chunks
                        while (this._nextOffset < this._nextBytes) {
                            // console.assert(this._lastChunk.byteLength === 0);

                            // Copy bytes from new chunk
                            const chunk = yield;
                            this._consume(chunk);
                        }

                        // Resume parser
                        if (!this._nextBuffer) {
                            // console.assert(this._nextBytes === 0);
                            this._nextBuffer = new Uint8Array(this._nextBytes);
                        }
                        result = parser.next(toArrayBufferView(this._nextBuffer, this._byteChunkConstructor));
                    }
                    // Done parsing
                    this._controller.enqueue(result.value);
                } catch (e) {
                    // An error occurred in next() or when allocating a new buffer
                    caughtError = {_error: e};
                    break;
                } finally {
                    if (result && !result.done && parser.return) {
                        // If return() throws and we didn't catch an error yet,
                        // then the outer try..catch will store the thrown error
                        const returnResult = parser.return();
                        if (returnResult.done && returnResult.value !== undefined) {
                            this._controller.enqueue(returnResult.value);
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore if we already caught an error earlier.
            // This can happen if next() throws, and then return() also throws
            if (!caughtError) {
                caughtError = {_error: e};
            }
        } finally {
            if (caughtError) {
                this._controller.error(caughtError._error);
            } else {
                this._controller.terminate();
            }
        }
    }

}

function toArrayBufferView<T extends ArrayBufferView>(src: Uint8Array, dest: ArrayBufferViewConstructor<T>): T {
    return new dest(src.buffer, src.byteOffset, src.byteLength / (dest.BYTES_PER_ELEMENT || 1));
}
