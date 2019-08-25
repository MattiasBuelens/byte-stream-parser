import {ByteStreamParser} from "../src/ByteStreamParser";
import {MockTransformController, Spied, spyOnMethods} from "./Mocks";

class ValueFlusher<T> extends ByteStreamParser<T> {

    constructor(private readonly readAmount: number,
                private readonly value: T,
                private readonly flushValue: T) {
        super(Uint8Array);
    }

    protected* parse_(): Generator<number, T, Uint8Array> {
        let completedNormally = false;
        try {
            yield this.readAmount;
            completedNormally = true;
        } finally {
            return completedNormally ? this.value : this.flushValue;
        }
    }

}

describe('throwing flusher on flush', () => {
    let controller!: Spied<MockTransformController<string>>;
    let flusher!: ValueFlusher<string>;
    const value = "normal value";
    const flushValue = "value from flush";
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        flusher = new ValueFlusher(3, value, flushValue);
        flusher.start(controller);
    });

    it('enqueues normal value after 3 bytes', () => {
        flusher.transform(new Uint8Array([1, 2, 3]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(value);
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
    });

    it('enqueues special value after flush', () => {
        flusher.flush();
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith(flushValue);
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });
});
