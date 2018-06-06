import {TransformStreamDefaultController, TransformStreamTransformer} from '@mattiasbuelens/web-streams-polyfill';

export interface ArrayBufferViewConstructor<T extends ArrayBufferView = ArrayBufferView> {
    new(buffer: ArrayBufferLike, byteOffset?: number, byteLength?: number): T;

    readonly BYTES_PER_ELEMENT?: number;
}

export interface ByteStreamParserIterator<T, B extends ArrayBufferView = Uint8Array>
    extends Iterator<number | T> {
    next(value?: B): IteratorResult<number | T>;
}

export interface ByteStreamParserIterableIterator<T, B extends ArrayBufferView = Uint8Array>
    extends ByteStreamParserIterator<T, B> {
    [Symbol.iterator](): ByteStreamParserIterableIterator<T, B>;
}

/**
 * @param <T> The type of output chunks.
 * @param <B> The type of input byte chunks for the parser. Defaults to {@code Uint8Array}.
 */
export abstract class ByteStreamParser<T, B extends ArrayBufferView = Uint8Array>
    implements TransformStreamTransformer<Uint8Array, T> {

    private readonly _byteChunkConstructor!: ArrayBufferViewConstructor<B>;
    protected _controller!: TransformStreamDefaultController<T>;
    private _iterator!: Iterator<void>;
    private _nextBytes: number = 0;
    private _nextBuffer: Uint8Array | undefined = undefined;
    private _nextOffset: number = 0;
    private _lastChunk: Uint8Array = new Uint8Array(0);

    constructor(byteChunkConstructor: ArrayBufferViewConstructor<B>) {
        this._byteChunkConstructor = byteChunkConstructor;
    }

    start(controller: TransformStreamDefaultController<T>): void {
        this._controller = controller;
        this._iterator = this._run();
        void this._iterator.next();
    }

    transform(chunk: Uint8Array): void {
        void this._iterator.next(chunk);
    }

    flush(): void {
        this._iterator.return!();
    }

    protected abstract parse_(): ByteStreamParserIterator<T, B>;

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

    private* _run(): IterableIterator<void> {
        try {
            while (true) {
                yield* this._runSingle();
            }
        } catch (e) {
            this._controller.error(e);
        } finally {
            try {
                this._controller.terminate();
            } catch (e) {
                this._controller.error(e);
            }
        }
    }

    private* _runSingle(): IterableIterator<void> {
        let parser: ByteStreamParserIterator<T, B> = this.parse_();
        try {
            // console.assert(this._lastChunk.byteLength === 0);
            let result = parser.next();
            while (!result.done) {
                this._nextBytes = result.value as number;
                this._nextBuffer = undefined;
                this._nextOffset = 0;

                // Copy bytes from last chunk
                this._consume(this._lastChunk);

                // Copy bytes from new chunks
                while (this._nextOffset < this._nextBytes) {
                    // console.assert(this._lastChunk.byteLength === 0);

                    // Copy bytes from new chunk
                    this._consume(yield);
                }

                // Resume parser
                if (!this._nextBuffer) {
                    // console.assert(this._nextBytes === 0);
                    this._nextBuffer = new Uint8Array(this._nextBytes);
                }
                result = parser.next(toArrayBufferView(this._nextBuffer, this._byteChunkConstructor));
            }
            // Done parsing
            this._controller.enqueue(result.value as T);
        } finally {
            if (parser.return) {
                const result = parser.return();
                if (result.done && result.value !== undefined) {
                    this._controller.enqueue(result.value as T);
                }
            }
        }
    }

}

function toArrayBufferView<T extends ArrayBufferView>(src: Uint8Array, dest: ArrayBufferViewConstructor<T>): T {
    return new dest(src.buffer, src.byteOffset, src.byteLength / (dest.BYTES_PER_ELEMENT || 1));
}
