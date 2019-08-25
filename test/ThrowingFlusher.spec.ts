import {ByteStreamParser} from "../src/ByteStreamParser";
import {MockTransformController, Spied, spyOnMethods} from "./Mocks";

class ThrowingFlusher extends ByteStreamParser<never> {

    constructor(private readonly readAmount: number,
                private readonly error: any) {
        super(Uint8Array);
    }

    protected* parse_(): Generator<number, never, Uint8Array> {
        try {
            yield this.readAmount;
        } finally {
            throw this.error;
        }
    }

}

describe('throwing flusher on flush', () => {
    let controller!: Spied<MockTransformController<Uint8Array>>;
    let thrower!: ThrowingFlusher;
    const error = "oops";
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        thrower = new ThrowingFlusher(3, error);
        thrower.start(controller);
    });

    it('throws when flushing immediately', () => {
        thrower.flush();
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.error).toHaveBeenCalledTimes(1);
        expect(controller.error).toHaveBeenLastCalledWith(error);
        expect(controller.terminate).not.toHaveBeenCalled();
    });

    it('throws when flushing after first byte', () => {
        thrower.transform(new Uint8Array([1]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
        thrower.flush();
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.error).toHaveBeenCalledTimes(1);
        expect(controller.error).toHaveBeenLastCalledWith(error);
        expect(controller.terminate).not.toHaveBeenCalled();
    });
});
