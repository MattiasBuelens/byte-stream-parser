import {TransformStreamDefaultController, TransformStreamTransformer} from '@mattiasbuelens/web-streams-polyfill';

export abstract class ByteStreamParser<T> implements TransformStreamTransformer<Uint8Array, T> {

    protected _controller!: TransformStreamDefaultController<T>;
    private _iterator!: Iterator<void>;

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

    private* _run(): Iterator<void> {
        let parser = this.parse_();
        try {
            let nextBytes: number;
            let nextBuffer: Uint8Array | undefined;
            let nextOffset: number;
            let result = parser.next();
            let lastChunk = new Uint8Array(0);
            while (!result.done) {
                nextBytes = result.value;
                nextBuffer = undefined;
                nextOffset = 0;

                // Copy bytes from last chunk
                if (lastChunk.byteLength > 0) {
                    const neededBytes = nextBytes - nextOffset;
                    const usableBytes = Math.min(lastChunk.byteLength, neededBytes);
                    if (lastChunk.byteLength < neededBytes) {
                        // Not done yet
                        // Create buffer and copy entire chunk
                        nextBuffer = new Uint8Array(nextBytes);
                        nextBuffer.set(lastChunk, nextOffset);
                    } else {
                        // Got everything
                        // Use part of chunk and store remainder
                        nextBuffer = lastChunk.subarray(0, usableBytes);
                        lastChunk = lastChunk.subarray(usableBytes);
                    }
                    nextOffset += usableBytes;
                }

                // Copy bytes from new chunks
                while (nextOffset < nextBytes) {
                    // console.assert(lastChunk.byteLength === 0);

                    // Copy bytes from new chunk
                    const chunk: Uint8Array = yield;
                    const neededBytes = nextBytes - nextOffset;
                    const usableBytes = Math.min(chunk.byteLength, neededBytes);
                    if (chunk.byteLength < neededBytes) {
                        // Not done yet
                        // Copy entire chunk
                        if (!nextBuffer) {
                            nextBuffer = new Uint8Array(nextBytes);
                        }
                        nextBuffer.set(chunk, nextOffset);
                    } else {
                        // Got everything
                        // Use part of chunk and store remainder
                        if (!nextBuffer) {
                            nextBuffer = chunk.subarray(0, usableBytes);
                        } else {
                            nextBuffer.set(chunk.subarray(0, usableBytes), nextOffset);
                        }
                        lastChunk = chunk.subarray(usableBytes);
                    }
                    nextOffset += usableBytes;
                }

                // Resume parser
                if (!nextBuffer) {
                    // console.assert(nextBytes === 0);
                    nextBuffer = new Uint8Array(nextBytes);
                }
                result = parser.next(nextBuffer);
            }
        } catch (e) {
            this._controller.error(e);
        } finally {
            this._controller.terminate();
            parser.return!();
        }
    }

}
