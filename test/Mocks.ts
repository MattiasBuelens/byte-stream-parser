export class MockTransformController<T> implements TransformStreamDefaultController<T> {
    readonly desiredSize: number = 0;

    enqueue(chunk: T): void {
    }

    error(reason: any): void {
    }

    terminate(): void {
    }
}

export type Spied<T, K extends keyof T = keyof T> = {
    [P in K]: T[P] extends Function ? (T[P] & jest.SpyInstance<T[P]>) : T[P];
} & T;

export function spyOnMethods<T, K extends keyof T>(object: T, methods: K[]): Spied<T, K> {
    for (let method of methods) {
        jest.spyOn(object, method);
    }
    return object as Spied<T, K>;
}
