import {ByteStreamParser, ByteStreamParserIterableIterator} from "../src/ByteStreamParser";
import {MockTransformController, Spied, spyOnMethods} from "./Mocks";

class Chunker extends ByteStreamParser<Uint8Array> {

    constructor(private readonly chunkSize: number) {
        super(Uint8Array);
    }

    protected* parse_(): ByteStreamParserIterableIterator<Uint8Array> {
        return yield this.chunkSize;
    }

}

class ChunkerWithoutReturn extends Chunker {

    protected parse_(): ByteStreamParserIterableIterator<Uint8Array> {
        const iterator = super.parse_();
        const iteratorWithoutReturn = {
            next: iterator.next.bind(iterator),
            throw: iterator.throw && iterator.throw.bind(iterator),
            return: undefined,
            [Symbol.iterator]: () => iteratorWithoutReturn
        };
        return iteratorWithoutReturn;
    }

}

class ChunkerWithFinally extends Chunker {

    constructor(chunkSize: number,
                private readonly finalValue: Uint8Array) {
        super(chunkSize);
    }

    protected* parse_(): ByteStreamParserIterableIterator<Uint8Array> {
        let result: Uint8Array | undefined;
        try {
            result = yield* super.parse_();
            return result;
        } finally {
            if (!result) {
                return this.finalValue;
            }
        }
    }

}

describe('3-byte chunker', () => {
    let controller!: Spied<MockTransformController<Uint8Array>>;
    let chunker!: Chunker;
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        chunker = new Chunker(3);
        chunker.start(controller);
    });

    it('handles single byte inputs', () => {
        chunker.transform(new Uint8Array([1]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([2]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        chunker.transform(new Uint8Array([5]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        chunker.transform(new Uint8Array([6]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 2-byte inputs', () => {
        chunker.transform(new Uint8Array([1, 2]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3, 4]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([5, 6]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 3-byte inputs', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4, 5, 6]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 6-byte input', () => {
        chunker.transform(new Uint8Array([1, 2, 3, 4, 5, 6]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles inputs with different lengths', () => {
        chunker.transform(new Uint8Array([1, 2]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3, 4, 5, 6, 7]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
        chunker.transform(new Uint8Array([8, 9, 10]));
        expect(controller.enqueue).toHaveBeenCalledTimes(3);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([7, 8, 9]));
        chunker.transform(new Uint8Array([11, 12]));
        expect(controller.enqueue).toHaveBeenCalledTimes(4);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([10, 11, 12]));
    });

    it('handles flush after 0 bytes', () => {
        chunker.transform(new Uint8Array([]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        chunker.flush();
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });

    it('handles flush after 3 bytes', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.flush();
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });

    it('handles flush after 4 bytes', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4]));
        chunker.flush();
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });

    it('does not allocate when receiving exact chunk', () => {
        const input1 = new Uint8Array([1, 2, 3]);
        chunker.transform(input1);
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        const chunk1: Uint8Array = controller.enqueue.mock.calls[0][0];
        expect(chunk1.buffer).toBe(input1.buffer);
        expect(chunk1.byteOffset).toBe(0);
        expect(chunk1.byteLength).toBe(3);
    });

    it('does not allocate when receiving multiple exact chunks', () => {
        const input1 = new Uint8Array([1, 2, 3, 4, 5, 6]);
        chunker.transform(input1);
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        const chunk1: Uint8Array = controller.enqueue.mock.calls[0][0];
        expect(chunk1.buffer).toBe(input1.buffer);
        expect(chunk1.byteOffset).toBe(0);
        expect(chunk1.byteLength).toBe(3);
        const chunk2: Uint8Array = controller.enqueue.mock.calls[1][0];
        expect(chunk2.buffer).toBe(input1.buffer);
        expect(chunk2.byteOffset).toBe(3);
        expect(chunk2.byteLength).toBe(3);
    });

});

describe('3-byte chunker without return', () => {
    let controller!: Spied<MockTransformController<Uint8Array>>;
    let chunker!: ChunkerWithoutReturn;
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        chunker = new ChunkerWithoutReturn(3);
        chunker.start(controller);
    });

    it('handles flush', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.flush();
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });
});

describe('3-byte chunker with finally', () => {
    let controller!: Spied<MockTransformController<Uint8Array>>;
    let chunker!: ChunkerWithFinally;
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        chunker = new ChunkerWithFinally(3, new Uint8Array([42]));
        chunker.start(controller);
    });

    it('handles flush', () => {
        chunker.transform(new Uint8Array([1, 2, 3, 4, 5]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.flush();
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenLastCalledWith(new Uint8Array([42]));
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });
});
