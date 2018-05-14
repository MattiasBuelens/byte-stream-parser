import {ByteStreamParser} from "../src/ByteStreamParser";
import {TransformStreamDefaultController} from "@mattiasbuelens/web-streams-polyfill";

class Chunker extends ByteStreamParser<Uint8Array> {

    constructor(private readonly chunkSize: number) {
        super();
    }

    protected* parse_(): Iterator<number> {
        while (true) {
            this.push(yield this.chunkSize);
        }
    }

}

class MockTransformController<T> implements TransformStreamDefaultController<T> {
    readonly desiredSize: number = 0;

    enqueue(chunk: T): void {
    }

    error(reason: any): void {
    }

    terminate(): void {
    }
}

describe('with 3-byte chunker', () => {
    let controller!: MockTransformController<Uint8Array>;
    let controllerEnqueue!: jest.SpyInstance;
    let chunker!: Chunker;
    beforeEach(() => {
        controller = new MockTransformController();
        controllerEnqueue = jest.spyOn(controller, 'enqueue');
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

});
