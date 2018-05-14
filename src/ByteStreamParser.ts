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

    abstract parse_(): Iterator<number>;

    protected _enqueue(data: T) {
        this._controller.enqueue(data);
    }

    private* _run(): Iterator<void> {
        let parser = this.parse_();
        try {
            let result = parser.next();
            let lastChunk = new Uint8Array(0);
            while (!result.done) {
                const nextBytes = result.value;
                const nextBuffer = new Uint8Array(nextBytes);
                let nextOffset = 0;

                // Copy bytes from last chunk
                const lastBytes = Math.min(lastChunk.byteLength, nextBytes - nextOffset);
                nextBuffer.set(lastChunk.subarray(0, lastBytes), nextOffset);
                lastChunk = lastChunk.subarray(lastBytes);
                nextOffset += lastBytes;

                // Copy bytes from new chunks
                while (nextOffset < nextBytes) {
                    // console.assert(lastChunk.byteLength === 0);

                    // Copy bytes from new chunk
                    const chunk: Uint8Array = yield;
                    const chunkBytes = Math.min(chunk.byteLength, nextBytes - nextOffset);
                    if (chunkBytes === chunk.byteLength) {
                        // Not done yet
                        // Copy entire chunk
                        nextBuffer.set(chunk, nextOffset);
                    } else {
                        // Got everything
                        // Copy part of chunk and store remainder
                        nextBuffer.set(chunk.subarray(0, chunkBytes), nextOffset);
                        lastChunk = chunk.subarray(chunkBytes);
                    }
                    nextOffset += chunkBytes;
                }

                // Resume parser
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
