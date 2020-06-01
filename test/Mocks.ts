import {jest} from "@jest/globals";

export class MockTransformController<O> implements TransformStreamDefaultController<O> {
    readonly desiredSize: number = 0;

    enqueue(chunk: O): void {
    }

    error(reason: any): void {
    }

    terminate(): void {
    }
}

// see https://github.com/Microsoft/TypeScript/issues/25215
type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never }[keyof T] & string;

export type Spied<T> = {
    [P in FunctionPropertyNames<T>]: T[P] & jest.SpyInstance<T[P]>;
} & T;

export function spyOnMethods<T, K extends FunctionPropertyNames<T>>(object: T, methods: K[]): Spied<T> {
    for (let method of methods) {
        jest.spyOn(object, method);
    }
    return object as Spied<T>;
}
