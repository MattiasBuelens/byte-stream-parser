import {ByteStreamParser, ByteStreamParserGenerator} from "../src/ByteStreamParser";
import {MockTransformController, Spied, spyOnMethods} from "./Mocks";

interface Packet {
    size: number;
    data: Uint8Array;
}

class Packetizer extends ByteStreamParser<Packet> {

    constructor() {
        super(Uint8Array);
    }

    protected* parse_(): ByteStreamParserGenerator<Packet> {
        const size = (yield 1)[0];
        const data = yield size;
        return {size, data};
    }

}

describe('packetizer', () => {
    let controller!: Spied<MockTransformController<Packet>>;
    let packetizer!: Packetizer;
    beforeEach(() => {
        controller = spyOnMethods(new MockTransformController(), ['enqueue', 'error', 'terminate']);
        packetizer = new Packetizer();
        packetizer.start(controller);
    });

    it('handles empty packet', () => {
        packetizer.transform(new Uint8Array([0]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith({
            size: 0,
            data: new Uint8Array([])
        });
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
    });

    it('handles single byte packets', () => {
        packetizer.transform(new Uint8Array([1]));
        expect(controller.enqueue).not.toHaveBeenCalled();
        packetizer.transform(new Uint8Array([42]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith({
            size: 1,
            data: new Uint8Array([42])
        });
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
    });

    it('handles multiple packets with different sizes', () => {
        packetizer.transform(new Uint8Array([1, 42]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        expect(controller.enqueue).toHaveBeenLastCalledWith({
            size: 1,
            data: new Uint8Array([42])
        });
        packetizer.transform(new Uint8Array([3, 101]));
        expect(controller.enqueue).toHaveBeenCalledTimes(1);
        packetizer.transform(new Uint8Array([102, 103]));
        expect(controller.enqueue).toHaveBeenCalledTimes(2);
        expect(controller.enqueue).toHaveBeenLastCalledWith({
            size: 3,
            data: new Uint8Array([101, 102, 103])
        });
        expect(controller.error).not.toHaveBeenCalled();
        expect(controller.terminate).not.toHaveBeenCalled();
    });
});
