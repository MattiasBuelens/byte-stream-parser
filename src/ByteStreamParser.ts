import {TransformStreamDefaultController, TransformStreamTransformer} from '@mattiasbuelens/web-streams-polyfill';

export abstract class ByteStreamParser<T> implements TransformStreamTransformer<Uint8Array, T> {

    protected _controller!: TransformStreamDefaultController<T>;
    private _iterator!: Iterator<void>;
    private _nextBytes: number = 0;
    private _nextBuffer: Uint8Array | undefined = undefined;
    private _nextOffset: number = 0;
    private _lastChunk: Uint8Array = new Uint8Array(0);

    start(controller: TransformStreamDefaultController<T>): void {
        this._controller = controller;
        this._iterator = this._run();
        this._iterator.next();
    }

    transform(chunk: Uint8Array): void {
        this._iterator.next(chunk);
    }

    flush(): void {
        this._iterator.return!();
    }

    protected abstract parse_(): Iterator<number>;

    protected push(data: T) {
        this._controller.enqueue(data);
    }

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

    private* _run(): Iterator<void> {
        let parser = this.parse_();
        try {
            let result = parser.next();
            while (!result.done) {
                this._nextBytes = result.value;
                this._nextBuffer = undefined;
                this._nextOffset = 0;

                // Copy bytes from last chunk
                this._consume(this._lastChunk);

                // Copy bytes from new chunks
                while (this._nextOffset < this._nextBytes) {
                    // console.assert(lastChunk.byteLength === 0);

                    // Copy bytes from new chunk
                    this._consume(yield);
                }

                // Resume parser
                if (!this._nextBuffer) {
                    // console.assert(nextBytes === 0);
                    this._nextBuffer = new Uint8Array(this._nextBytes);
                }
                result = parser.next(this._nextBuffer);
            }
        } catch (e) {
            this._controller.error(e);
        } finally {
            try {
                parser.return!();
                this._controller.terminate();
            } catch (e) {
                this._controller.error(e);
            }
        }
    }

}
