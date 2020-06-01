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

type AnyFunction = (...args: any[]) => any;

// see https://github.com/Microsoft/TypeScript/issues/25215
type FunctionPropertyNames<T> = { [K in keyof T]: T[K] extends AnyFunction ? K : never }[keyof T] & string;

type MockFunctionState<T, Y extends Array<unknown>> = {
    calls: Array<Y>;
    instances: Array<T>;
}

interface SpyInstance<T, Y extends Array<unknown>> {
    mock: MockFunctionState<T, Y>;
}

type SpiedFunction<T> = T & (T extends AnyFunction ? SpyInstance<ReturnType<T>, Parameters<T>> : never);

export type Spied<T> = {
    [P in FunctionPropertyNames<T>]: SpiedFunction<T[P]>;
} & T;

export function spyOnMethods<T, K extends FunctionPropertyNames<T>>(object: T, methods: K[]): Spied<T> {
    for (let method of methods) {
        jest.spyOn(object, method);
    }
    return object as Spied<T>;
}
