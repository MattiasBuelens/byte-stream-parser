import {TransformStreamDefaultController, TransformStreamTransformer} from '@mattiasbuelens/web-streams-polyfill';

interface ByteStreamParserState {
    _nextBytes: number;
    _nextBuffer: Uint8Array | undefined;
    _nextOffset: number;
    _lastChunk: Uint8Array;
}

export abstract class ByteStreamParser<T> implements TransformStreamTransformer<Uint8Array, T> {

    protected _controller!: TransformStreamDefaultController<T>;
    private _iterator!: Iterator<void>;
    private _state: ByteStreamParserState = {
        _nextBytes: 0,
        _nextBuffer: undefined,
        _nextOffset: 0,
        _lastChunk: new Uint8Array(0)
    };

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
        const state = this._state;
        const neededBytes = state._nextBytes - state._nextOffset;
        const usableBytes = Math.min(chunk.byteLength, neededBytes);
        if (chunk.byteLength < neededBytes) {
            // Not done yet
            // Copy entire chunk
            if (!state._nextBuffer) {
                state._nextBuffer = new Uint8Array(state._nextBytes);
            }
            state._nextBuffer.set(chunk, state._nextOffset);
        } else {
            // Got everything
            // Use part of chunk and store remainder
            if (!state._nextBuffer) {
                state._nextBuffer = chunk.subarray(0, usableBytes);
            } else {
                state._nextBuffer.set(chunk.subarray(0, usableBytes), state._nextOffset);
            }
        }
        state._nextOffset += usableBytes;
        state._lastChunk = chunk.subarray(usableBytes);
    }

    private* _run(): Iterator<void> {
        let parser = this.parse_();
        try {
            let state = this._state;
            let result = parser.next();
            state._lastChunk = new Uint8Array(0);
            while (!result.done) {
                state._nextBytes = result.value;
                state._nextBuffer = undefined;
                state._nextOffset = 0;

                // Copy bytes from last chunk
                this._consume(state._lastChunk);

                // Copy bytes from new chunks
                while (state._nextOffset < state._nextBytes) {
                    // console.assert(lastChunk.byteLength === 0);

                    // Copy bytes from new chunk
                    this._consume(yield);
                }

                // Resume parser
                if (!state._nextBuffer) {
                    // console.assert(nextBytes === 0);
                    state._nextBuffer = new Uint8Array(state._nextBytes);
                }
                result = parser.next(state._nextBuffer);
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
