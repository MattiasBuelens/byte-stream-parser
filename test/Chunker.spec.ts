import {ByteStreamParser, ByteStreamParserIterator} from "../src/ByteStreamParser";
import {MockTransformController} from "./Mocks";

class Chunker extends ByteStreamParser<Uint8Array> {

    constructor(private readonly chunkSize: number) {
        super();
    }

    protected* parse_(): ByteStreamParserIterator {
        while (true) {
            this.push(yield this.chunkSize);
        }
    }

}

class ChunkerWithoutReturn extends Chunker {

    protected parse_(): ByteStreamParserIterator {
        const iterator = super.parse_();
        return {
            next: iterator.next,
            throw: iterator.throw,
            return: undefined
        };
    }

}

describe('3-byte chunker', () => {
    let controller!: MockTransformController<Uint8Array>;
    let controllerEnqueue!: jest.SpyInstance;
    let controllerTerminate!: jest.SpyInstance;
    let chunker!: Chunker;
    beforeEach(() => {
        controller = new MockTransformController();
        controllerEnqueue = jest.spyOn(controller, 'enqueue');
        controllerTerminate = jest.spyOn(controller, 'terminate');

        chunker = new Chunker(3);
        chunker.start(controller);
    });

    it('handles single byte inputs', () => {
        chunker.transform(new Uint8Array([1]));
        expect(controllerEnqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([2]));
        expect(controllerEnqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        chunker.transform(new Uint8Array([5]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        chunker.transform(new Uint8Array([6]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 2-byte inputs', () => {
        chunker.transform(new Uint8Array([1, 2]));
        expect(controllerEnqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3, 4]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([5, 6]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 3-byte inputs', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4, 5, 6]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles 6-byte input', () => {
        chunker.transform(new Uint8Array([1, 2, 3, 4, 5, 6]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        expect(controllerEnqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
    });

    it('handles inputs with different lengths', () => {
        chunker.transform(new Uint8Array([1, 2]));
        expect(controllerEnqueue).not.toHaveBeenCalled();
        chunker.transform(new Uint8Array([3, 4, 5, 6, 7]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        expect(controllerEnqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledWith(new Uint8Array([4, 5, 6]));
        chunker.transform(new Uint8Array([8, 9, 10]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(3);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([7, 8, 9]));
        chunker.transform(new Uint8Array([11, 12]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(4);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([10, 11, 12]));
    });

    it('handles flush after 0 bytes', () => {
        chunker.transform(new Uint8Array([]));
        expect(controllerEnqueue).not.toHaveBeenCalled();
        chunker.flush();
        expect(controllerEnqueue).not.toHaveBeenCalled();
        expect(controllerTerminate).toHaveBeenCalledTimes(1);
    });

    it('handles flush after 3 bytes', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.flush();
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerTerminate).toHaveBeenCalledTimes(1);
    });

    it('handles flush after 4 bytes', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.transform(new Uint8Array([4]));
        chunker.flush();
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerTerminate).toHaveBeenCalledTimes(1);
    });

    it('does not allocate when receiving exact chunk', () => {
        const input1 = new Uint8Array([1, 2, 3]);
        chunker.transform(input1);
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        const chunk1: Uint8Array = controllerEnqueue.mock.calls[0][0];
        expect(chunk1.buffer).toBe(input1.buffer);
        expect(chunk1.byteOffset).toBe(0);
        expect(chunk1.byteLength).toBe(3);
    });

    it('does not allocate when receiving multiple exact chunks', () => {
        const input1 = new Uint8Array([1, 2, 3, 4, 5, 6]);
        chunker.transform(input1);
        expect(controllerEnqueue).toHaveBeenCalledTimes(2);
        const chunk1: Uint8Array = controllerEnqueue.mock.calls[0][0];
        expect(chunk1.buffer).toBe(input1.buffer);
        expect(chunk1.byteOffset).toBe(0);
        expect(chunk1.byteLength).toBe(3);
        const chunk2: Uint8Array = controllerEnqueue.mock.calls[1][0];
        expect(chunk2.buffer).toBe(input1.buffer);
        expect(chunk2.byteOffset).toBe(3);
        expect(chunk2.byteLength).toBe(3);
    });

});

describe('3-byte chunker without return', () => {
    let controller!: MockTransformController<Uint8Array>;
    let controllerEnqueue!: jest.SpyInstance;
    let controllerError!: jest.SpyInstance;
    let controllerTerminate!: jest.SpyInstance;
    let chunker!: ChunkerWithoutReturn;
    beforeEach(() => {
        controller = new MockTransformController();
        controllerEnqueue = jest.spyOn(controller, 'enqueue');
        controllerError = jest.spyOn(controller, 'error');
        controllerTerminate = jest.spyOn(controller, 'terminate');

        chunker = new ChunkerWithoutReturn(3);
        chunker.start(controller);
    });

    it('handles flush', () => {
        chunker.transform(new Uint8Array([1, 2, 3]));
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerEnqueue).toHaveBeenLastCalledWith(new Uint8Array([1, 2, 3]));
        chunker.flush();
        expect(controllerEnqueue).toHaveBeenCalledTimes(1);
        expect(controllerError).not.toHaveBeenCalled();
        expect(controllerTerminate).toHaveBeenCalledTimes(1);
    });
});
