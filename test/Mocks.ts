import {TransformStreamDefaultController} from "@mattiasbuelens/web-streams-polyfill";

export class MockTransformController<T> implements TransformStreamDefaultController<T> {
    readonly desiredSize: number = 0;

    enqueue(chunk: T): void {
    }

    error(reason: any): void {
    }

    terminate(): void {
    }
}
