export * from './utils';
import { ConcatMultiple as ConcatMultipleTuple } from 'typescript-tuple';
export declare type ConcatMultiple<TupleSet extends {
    name: string;
    in: GenericObject;
    out?: any;
}[][]> = ConcatMultipleTuple<TupleSet>;
declare type GenericObject = {
    [key: string]: any;
};
export declare type Action<ActionName extends string, In extends GenericObject, Out extends any> = {
    name: ActionName;
    in: In;
    out: Out;
};
export declare type Event<EventName extends string, In extends GenericObject> = {
    name: EventName;
    in: In;
};
declare type KeyOfTuple<T> = Exclude<keyof T, keyof Array<any>>;
export declare type GetNames<T extends any[]> = {
    [K in KeyOfTuple<T>]: T[K] extends {
        name: any;
    } ? T[K]['name'] : never;
}[KeyOfTuple<T>];
export declare type GetAllNameKeysAndLength<T extends any[]> = GetNameKeys<T, any> | 'length';
export declare type GetNameKeys<T extends any[], P extends GetNames<T>> = {
    [K in KeyOfTuple<T>]: T[K] extends {
        name: any;
    } ? T[K]['name'] extends P ? K : never : never;
}[KeyOfTuple<T>];
export declare type GetParams<T extends any[], P extends GetNames<T>> = {
    [K in GetNameKeys<T, P>]: T[K] extends {
        in: any;
    } ? T[K]['in'] : never;
}[GetNameKeys<T, P>];
export declare type GetReturn<T extends any[], P extends GetNames<T>> = {
    [K in GetNameKeys<T, P>]: T[K] extends {
        out: any;
    } ? T[K]['out'] : never;
}[GetNameKeys<T, P>];
export declare type GetServiceOwnActions<T extends any[]> = {
    [K in GetNames<T>]: (...args: any) => any;
};
