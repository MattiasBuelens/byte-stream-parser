import {ByteStreamParser, ByteStreamParserIterableIterator} from "../src/ByteStreamParser";
import {MockTransformController, Spied, spyOnMethods} from "./Mocks";

class Thrower extends ByteStreamParser<never> {

    constructor(private readonly readAmount: number,
                private readonly error: any) {
        super(Uint8Array);
    }

    protected* parse_(): ByteStreamParserIterableIterator<never> {
        yield this.readAmount;
        throw this.error;
    }

}

describe('thrower after 3 bytes', () => {
    let controller!: Spied<MockTransformController<Uint8Array>>;
    let thrower!: Thrower;
    const error = "oops";
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        thrower = new Thrower(3, error);
        thrower.start(controller);
    });

    it('throws after third byte', () => {
        thrower.transform(new Uint8Array([1, 2]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
        thrower.transform(new Uint8Array([3]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        expect(controller.error).toHaveBeenCalledTimes(1);
        expect(controller.error).toHaveBeenLastCalledWith(error);
        expect(controller.terminate).toHaveBeenCalledTimes(1);
    });
});
