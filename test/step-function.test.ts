import { aws_stepfunctions, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Pass } from "aws-cdk-lib/aws-stepfunctions";
import "jest";
import type * as AWS from "aws-sdk";
import * as functionless from "../src";
import {
  $AWS,
  $SFN,
  EventBus,
  Event,
  ExpressStepFunction,
  StepFunction,
  SyncExecutionResult,
  ErrorCodes,
  SynthError,
  StepFunctionError,
} from "../src";
import { StateMachine, States, Task } from "../src/asl";
import { Function } from "../src/function";
import { initStepFunctionApp, normalizeCDKJson, Person } from "./util";

/**
 * Removes randomized values (CDK token strings) form the definitions.
 */
const normalizeDefinition = (definition: StateMachine<States>): any => {
  return normalizeCDKJson(definition);
};

/**
 * Expect a task to match the given contents. Use Jest's `toMatchObject`.
 * Selects the task to check using the first key in states or by finding the key using the taskNameMatcher.
 */
const expectTaskToMatch = (
  definition: StateMachine<States>,
  partialTask: Partial<Task>,
  taskNameMatcher?: string | RegExp
): any => {
  const [key] = !taskNameMatcher
    ? Object.keys(definition.States)
    : Object.keys(definition.States).filter((k) =>
        typeof taskNameMatcher === "string"
          ? k.includes(taskNameMatcher)
          : taskNameMatcher.test(k)
      );

  expect(key).toBeDefined();

  const task = <Task>definition.States[key!];

  expect(task).toMatchObject(partialTask);
};

test("empty function", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {}).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return identifier", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string>(
    stack,
    "fn",
    (input) => {
      return input.id;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return PropAccessExpr", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { input: { id: string } }) => {
      return input.input.id;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return ElementAccessExpr", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { input: { "id special": string } }) => {
      return input.input["id special"];
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return ElementAccessExpr identifier", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(
        stack,
        "fn",
        (input: { input: { id: string } }) => {
          const id = "id";
          return input.input[id];
        }
      )
  ).toThrow("Collection element accessor must be a constant string or number");
});

test("return ElementAccessExpr expression", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(
        stack,
        "fn",
        (input: { input: { id: string } }) => {
          const id: string | null = null;
          return input.input[id ?? "id"];
        }
      )
  ).toThrow("Collection element accessor must be a constant string or number");
});

test("return ElementAccessExpr number", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { input: { arr: string[] } }) => {
      return input.input.arr[0];
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return ElementAccessExpr number reference", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(
        stack,
        "fn",
        (input: { input: { arr: string[] } }) => {
          const id = 0;
          return input.input.arr[id];
        }
      )
  ).toThrow("Collection element accessor must be a constant string or number");
});

test("return optional PropAccessExpr", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { input: { id?: string } },
    string | undefined
  >(stack, "fn", (input) => {
    return input.input?.id;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return items.slice(1)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string[]>(
    stack,
    "fn",
    (input) => {
      return input.items.slice(1);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return items.slice(1, undefined)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string[]>(
    stack,
    "fn",
    (input) => {
      return input.items.slice(1, undefined);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return items.slice(-1)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string[]>(
    stack,
    "fn",
    (input) => {
      return input.items.slice(-1);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return items.slice(0, -1)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string[]>(
    stack,
    "fn",
    (input) => {
      return input.items.slice(0, -1);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return items.slice(1, 3)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string[]>(
    stack,
    "fn",
    (input) => {
      return input.items.slice(1, 3);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return task({key: items.slice(1, 3)})", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { items: string[] },
    number | null
  >(stack, "fn", async (input) => {
    return task({ key: input.items.slice(1, 3) });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("let and set", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    let a;
    a = null;
    a = true;
    a = false;
    a = 0;
    a = -1;
    a = -100;
    a = 1 + 2;
    a = "hello";
    a = "hello" + " world";
    a = "hello" + 1;
    a = 1 + "hello";
    a = "hello" + true;
    a = false + "hello";
    a = null + "hello";
    a = "hello" + null;
    a = [null];
    a = [1];
    a = [-1];
    a = [true];
    a = [
      {
        key: "value",
      },
    ];
    a = {
      key: "value",
    };
    a = { 1: "value" };
    a = a;
    a = "hello" + { place: "world" };
    a = "hello" + ["world"];
    return a;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("set obj", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    let a = { 1: "value" };
    let b = a[1];
    let c = a["1"];
    return { a, b, c };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("let undefined", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(stack, "fn", () => {
        let a = undefined;
        a = "b";
        // returning undefined is invalid.
        return a;
      })
  ).toThrow("Undefined literal is not supported");
});

test("let empty", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    let a;
    a = "b";
    // returning undefined is invalid.
    return a;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("shadow", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    const a = ""; // a
    const a__2 = ""; // take a future updated name, a__2
    for (const b in [1, 2, 3]) {
      const a = ""; // take a future real name, a__1
      const a__1 = ""; // name already exists, will use a__1__1
      if (a === "") {
        const a = ""; // a__3
        return `${a}${b}${a__1}`;
      }
    }

    return `${a}${a__2}`;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("undefined in ExprStmt", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(stack, "fn", () => {
        undefined;
      })
  ).toThrow("Undefined literal is not supported");
});

test("undefined in ternary", () => {
  const { stack, task } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(stack, "fn", async (input: { a: boolean }) => {
        // this should pass because undefined is just ignored
        input.a ? undefined : await task();
      })
  ).toThrow("Undefined literal is not supported");
});

test("undefined in task input", () => {
  const { stack, task } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction(stack, "fn", async () => {
        await task(undefined);
      })
  ).toThrow("Undefined literal is not supported");
});

test("task(any)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    await task();
    await task(null);
    await task(true);
    await task(false);
    await task(0);
    await task(-1);
    await task(-100);
    await task(1 + 2);
    await task("hello");
    await task("hello" + " world");
    await task("hello" + 1);
    await task(1 + "hello");
    await task("hello" + true);
    await task(false + "hello");
    await task(null + "hello");
    await task("hello" + null);
    await task([null]);
    await task([1]);
    await task([-1]);
    await task([true]);
    await task([
      {
        key: "value",
      },
    ]);
    await task({
      key: "value",
    });
    await task("hello" + { place: "world" });
    await task("hello" + ["world"]);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("spread constant array and object", () => {
  const array = [1, 2];
  const object = { hello: "world" };

  const definition = new StepFunction(stack, "fn", () => {
    return {
      array: [0, ...array, 3],
      object: {
        key: "value",
        ...object,
      },
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return void", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    return;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("conditionally return void", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    (input) => {
      if (input.id === "hello") {
        return;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("conditionally return void", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    (input) => {
      if (input.id === "hello") {
        return;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("condition on task output", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    async () => {
      if ((await task()) === 1) {
        return;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("boolean logic", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { a: boolean; b: boolean; s: string },
    { and: boolean; or: boolean }
  >(stack, "fn", (input) => {
    return {
      and: input.a && input.b,
      or: input.a || input.b,
      andCondition: input.a === input.b && input.s === "hello",
      orCondition: input.a === input.b || input.s === "hello",
      nullCondition: input.a === input.b ?? input.s === "hello",
      not: !true,
      notAnd: !(input.a && input.b),
      notOr: !(input.a || input.b),
      chain: !(input.a || (input.b && input.a)),
      andFalsyConstantString: "" && input.s,
      andTruthyConstantString: "hi" && input.s,
      andAllConstant: true && false,
      andVariable: input.a && input.s,
      orFalsyConstantString: "" || input.s,
      orTruthyConstantString: "hi" || input.s,
      orAllConstant: false || true,
      orVariable: input.b || input.s,
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("binary and unary unsupported", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn",
        (input) => input.a + input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn2",
        (input) => input.a - input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn3",
        (input) => input.a * input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn4",
        (input) => input.a / input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn5",
        (input) => input.a % input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn6",
        (input) => (input.a += input.a)
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn7",
        (input) => (input.a -= input.a)
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn8",
        (input) => (input.a *= input.a)
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn9",
        (input) => (input.a /= input.a)
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn10",
        (input) => (input.a %= input.a)
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn11",
        (input) => -input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn12",
        (input) => --input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn13",
        (input) => ++input.a
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn14",
        (input) => input.a++
      )
  ).toThrow("Step Function does not support operator");
  expect(
    () =>
      new ExpressStepFunction<{ a: number }, number>(
        stack,
        "fn15",
        (input) => input.a--
      )
  ).toThrow("Step Function does not support operator");
});

test("boolean return", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { a: boolean; b: boolean },
    boolean
  >(stack, "fn", (input) => {
    return input.a && input.b;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("null coalesce logic", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { a?: boolean; b: boolean },
    { null: boolean }
  >(stack, "fn", (input) => {
    return {
      null: input.a ?? input.b,
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if-else", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string>(
    stack,
    "fn",
    (input) => {
      if (input.id === "hello") {
        return "hello";
      } else {
        return "world";
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if (typeof x === ??)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string | null>(
    stack,
    "fn",
    (input) => {
      if (input.id === undefined) {
        return "null";
      } else if (typeof input.id === "undefined") {
        return "undefined";
      } else if (typeof input.id === "string") {
        return "string";
      } else if (typeof input.id === "boolean") {
        return "boolean";
      } else if (typeof input.id === "number") {
        return "number";
      } else if (typeof input.id === "bigint") {
        return "bigint";
      }
      return null;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if (?? === typeof x)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string | null>(
    stack,
    "fn",
    (input) => {
      if (input.id === undefined) {
        return "null";
      } else if ("undefined" === typeof input.id) {
        return "undefined";
      } else if ("string" === typeof input.id) {
        return "string";
      } else if ("boolean" === typeof input.id) {
        return "boolean";
      } else if ("number" === typeof input.id) {
        return "number";
      } else if ("bigint" === typeof input.id) {
        return "bigint";
      }
      return null;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return typeof x", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string | null>(
    stack,
    "fn",
    (input) => {
      return typeof input.id;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    if (true) {
      return "yup";
    }
    return "noop";
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("else if", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { val: string }) => {
      if (input.val === "a") {
        return "yup";
      } else if (input.val === "b") {
        return "yip";
      } else if (input.val === "c") {
        return "woop";
      }
      return "noop";
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if else", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { val: string }) => {
      if (input.val === "a") {
        return "yup";
      } else {
        return "noop";
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("else if else", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { val: string }) => {
      if (input.val === "a") {
        return "yup";
      } else if (input.val === "b") {
        return "woop";
      } else {
        return "noop";
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if if", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { val: string }) => {
      if (input.val !== "a") {
        if (input.val === "b") {
          return "hullo";
        }
      }
      return "woop";
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if invoke", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    if (await task()) {
      return "hi";
    }
    return "woop";
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

let stack: Stack;

beforeEach(() => {
  stack = new Stack();
});

test("put an event bus event", () => {
  interface BusDetails {
    value: string;
  }
  interface BusEvent extends Event<BusDetails> {}

  const bus = new EventBus<BusEvent>(stack, "testBus2");

  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    async (input) => {
      await bus.putEvents({
        "detail-type": "someEvent",
        source: "sfnTest",
        detail: {
          value: input.id,
        },
        version: "1",
        id: "bbbbbbbb-eeee-eeee-eeee-ffffffffffff",
        account: "123456789012",
        time: "2022-08-05T16:19:03Z",
        region: "us-east-1",
        resources: [
          "arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine",
        ],
        "trace-header":
          "X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1",
      });
    }
  ).definition;

  expectTaskToMatch(
    definition,
    {
      Parameters: { Entries: [{ EventBusName: bus.eventBusArn }] },
    },
    "1__await bus.putEvents"
  );

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("put multiple event bus events", () => {
  interface BusDetails {
    value: string;
    constant?: string;
  }
  interface BusEvent extends Event<BusDetails> {}

  const bus = new EventBus<BusEvent>(stack, "testBus");

  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    async (input) => {
      await bus.putEvents(
        {
          "detail-type": "someEvent",
          source: "sfnTest",
          detail: {
            value: input.id,
          },
        },
        {
          "detail-type": "someOtherEvent",
          source: "sfnTest",
          detail: {
            constant: "hi",
            value: input.id,
          },
        }
      );
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("if-else-if", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, string | void>(
    stack,
    "fn",
    (input) => {
      if (input.id === "hello") {
        return "hello";
      } else if (input.id === "world") {
        return "world";
      }
      return;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-loop and do nothing", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      for (const item of input.items) {
        // @ts-ignore
        const a = item;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-loop inline array", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    () => {
      for (const item of [1, 2, 3]) {
        // @ts-ignore
        const a = item;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for const i in items, items[i]", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      for (const i in input.items) {
        // @ts-ignore
        const a = items[i];
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for i in items, items[i]", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      var i;
      for (i in input.items) {
        // @ts-ignore
        const a = items[i];
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for i in items, items[i] (shadowed)", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction<{ items: string[] }, void>(
        stack,
        "fn",
        (input) => {
          var i;
          for (i in input.items) {
            const i = "";
            // @ts-ignore
            const a = items[i];
          }
        }
      )
  ).toThrow();
});

test("for let i in items, items[i] (shadowed)", () => {
  const { stack } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction<{ items: string[] }, void>(
        stack,
        "fn",
        (input) => {
          // @ts-ignore
          for (let i in input.items) {
            const i = "";
            // @ts-ignore
            const a = items[i];
          }
        }
      )
  ).toThrow();
});

test("empty for", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    async (input) => {
      for (const _ of [await task(input.items)]) {
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for return", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string>(
    stack,
    "fn",
    (input) => {
      for (const i in input.items) {
        if (input.items[i] === "1") {
          return input.items[i]!;
        }
      }

      for (const i of input.items) {
        if (i === "1") {
          return i;
        }
      }

      return "end";
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for continue", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string>(
    stack,
    "fn",
    (input) => {
      for (const i in input.items) {
        if (input.items[i] === "1") {
          continue;
        }
        return input.items[i]!;
      }

      for (const i of input.items) {
        if (i === "1") {
          continue;
        }
        return i;
      }

      return "end";
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for break", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string>(
    stack,
    "fn",
    (input) => {
      for (const i in input.items) {
        if (input.items[i] === "1") {
          break;
        }
        return input.items[i]!;
      }

      for (const i of input.items) {
        if (i === "1") {
          break;
        }
        return i;
      }

      return "end";
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for assign", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, string>(
    stack,
    "fn",
    (input) => {
      let a = "";
      for (const i in input.items) {
        a = `${i}`;
      }

      for (const i of input.items) {
        a = `${i}`;
      }

      return a;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return a single Lambda Function call", () => {
  const { stack, getPerson } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    Person | undefined
  >(stack, "fn", async (input) => {
    return getPerson({ id: input.id });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();

  expectTaskToMatch(
    definition,
    {
      Resource: getPerson.resource.functionArn,
    },
    "1__return getPerson"
  );
});

test("task(-1)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, any>(
    stack,
    "fn",
    () => {
      return task(-1);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("task(input.list[-1])", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    (input: { list: { [-1]: string } }) => {
      return task(input.list[-1]);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Lambda Function, store as variable, return variable", () => {
  const { stack, getPerson } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    Person | undefined
  >(stack, "fn", async (input) => {
    const person = await getPerson({ id: input.id });
    return person;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Lambda Function, store as variable, return variable no block", () => {
  const { stack, getPerson } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    Person | undefined
  >(stack, "fn", async (input) => getPerson({ id: input.id })).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

// TODO: support use case where promise is ultimately returned with no logic in between?
test.skip("call Lambda Function, store as variable, return promise variable", () => {
  const { stack, getPerson } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    Person | undefined
  >(stack, "fn", async (input) => {
    const person = getPerson({ id: input.id });
    return person;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return AWS.DynamoDB.GetItem", () => {
  const { stack, personTable } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    Person | undefined
  >(stack, "fn", async (input) => {
    const person = await $AWS.DynamoDB.GetItem({
      Table: personTable,
      Key: {
        id: {
          S: input.id,
        },
      },
    });

    if (person.Item === undefined) {
      return;
    }

    return {
      id: person.Item.id.S,
      name: person.Item.name.S,
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return AWS.DynamoDB.GetItem dynamic parameters", () => {
  const { stack, personTable } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string | undefined },
    Person | undefined
  >(stack, "fn", async (input) => {
    const person = await $AWS.DynamoDB.GetItem({
      Table: personTable,
      Key: {
        id: {
          S: input.id ?? "default",
        },
      },
    });

    if (person.Item === undefined) {
      return;
    }

    return {
      id: person.Item.id.S,
      name: person.Item.name.S,
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return AWS.Lambda.Invoke dynamic parameters", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string | undefined },
    number | undefined
  >(stack, "fn", async (input) => {
    return (
      await $AWS.Lambda.Invoke({
        Function: task,
        Payload: {
          id: input.id ?? "default",
        },
      })
    ).Payload;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call AWS.DynamoDB.GetItem, then Lambda and return LiteralExpr", () => {
  const { stack, personTable, computeScore } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { id: string },
    (Person & { score: number }) | undefined
  >(stack, "fn", async (input) => {
    const person = await $AWS.DynamoDB.GetItem({
      Table: personTable,
      Key: {
        id: {
          S: input.id,
        },
      },
    });

    if (person.Item === undefined) {
      return;
    }

    const score = await computeScore({
      id: person.Item.id.S,
      name: person.Item.name.S,
    });

    return {
      id: person.Item.id.S,
      name: person.Item.name.S,
      score,
    };
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("iam policy for AWS.SDK.CloudWatch.describeAlarms", () => {
  const { stack } = initStepFunctionApp();
  new ExpressStepFunction<undefined, AWS.CloudWatch.MetricAlarms | undefined>(
    stack,
    "fn",
    async () => {
      const { MetricAlarms } = await $AWS.SDK.CloudWatch.describeAlarms(
        {},
        {
          iam: { resources: ["*"] },
        }
      );

      return MetricAlarms;
    }
  );

  expect(Template.fromStack(stack)).toMatchSnapshot();
});

test("overwrite aslServiceName AWS.SDK.CloudWatch.describeAlarms", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    undefined,
    AWS.CloudWatch.MetricAlarms | undefined
  >(stack, "fn", async () => {
    const { MetricAlarms } = await $AWS.SDK.CloudWatch.describeAlarms(
      {},
      {
        iam: { resources: ["*"] },
        aslServiceName: "cw",
      }
    );

    return MetricAlarms;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("overwrite iamActions AWS.SDK.CloudWatch.describeAlarms", () => {
  const { stack } = initStepFunctionApp();
  new ExpressStepFunction<undefined, AWS.CloudWatch.MetricAlarms | undefined>(
    stack,
    "fn",
    async () => {
      const { MetricAlarms } = await $AWS.SDK.CloudWatch.describeAlarms(
        {},
        {
          iam: { resources: ["*"], actions: ["cloudwatch:Describe*"] },
        }
      );

      return MetricAlarms;
    }
  );

  expect(Template.fromStack(stack)).toMatchSnapshot();
});

test("add iamConditions AWS.SDK.CloudWatch.describeAlarms", () => {
  const { stack } = initStepFunctionApp();
  new ExpressStepFunction<undefined, AWS.CloudWatch.MetricAlarms | undefined>(
    stack,
    "fn",
    async () => {
      const { MetricAlarms } = await $AWS.SDK.CloudWatch.describeAlarms(
        {},
        {
          iam: {
            resources: ["*"],
            conditions: {
              StringEquals: {
                "aws:ResourceTag/env": ["test"],
              },
            },
          },
        }
      );

      return MetricAlarms;
    }
  );

  expect(Template.fromStack(stack)).toMatchSnapshot();
});

test("non-literal params AWS.SDK.CloudWatch.deleteAlarms", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<undefined, void>(
    stack,
    "fn",
    async () => {
      const { MetricAlarms } = await $AWS.SDK.CloudWatch.describeAlarms(
        {},
        {
          iam: { resources: ["*"] },
        }
      );

      if (MetricAlarms === undefined) {
        return;
      }

      await $AWS.SDK.CloudWatch.deleteAlarms(
        { AlarmNames: MetricAlarms.map((a) => a.AlarmName as string) },
        {
          iam: { resources: ["*"] },
        }
      );
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return AWS.SDK.CloudWatch.describeAlarms", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    undefined,
    AWS.CloudWatch.MetricAlarms | undefined
  >(stack, "fn", async () => {
    const alarms = await $AWS.SDK.CloudWatch.describeAlarms(
      {},
      {
        iam: { resources: ["*"] },
      }
    );

    if (alarms.MetricAlarms === undefined) {
      return;
    }

    return alarms.MetricAlarms;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return AWS.SDK.CloudWatch.describeAlarms dynamic parameters", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { prefix: string | undefined },
    AWS.CloudWatch.MetricAlarms | undefined
  >(stack, "fn", async (input) => {
    const alarms = await $AWS.SDK.CloudWatch.describeAlarms(
      {
        AlarmNamePrefix: input.prefix ?? "default",
      },
      {
        iam: { resources: ["*"] },
      }
    );

    if (alarms.MetricAlarms === undefined) {
      return;
    }

    return alarms.MetricAlarms;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-loop over a list literal", () => {
  const { stack, computeScore } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    async (input) => {
      const people = ["sam", "sam"];
      for (const name of people) {
        await computeScore({
          id: input.id,
          name,
        });
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("conditionally call DynamoDB and then void", () => {
  const { stack, personTable } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ id: string }, void>(
    stack,
    "fn",
    async (input): Promise<void> => {
      if (input.id === "hello") {
        await $AWS.DynamoDB.GetItem({
          Table: personTable,
          Key: {
            id: {
              S: input.id,
            },
          },
        });
      }
    }
  ).definition;

  expectTaskToMatch(
    definition,
    {
      Parameters: {
        TableName: personTable.resource.tableName,
      },
    },
    "1__await $AWS.DynamoDB.GetItem"
  );

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("waitFor literal number of seconds", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", (): string | void => {
    $SFN.waitFor(1);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("waitFor reference number of seconds", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { seconds: number },
    string | void
  >(stack, "fn", (input) => {
    $SFN.waitFor(input.seconds);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});
test("waitFor literal timestamp", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", (): string | void => {
    $SFN.waitUntil("2022-08-01T00:00:00Z");
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("waitUntil reference timestamp", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ until: string }, string | void>(
    stack,
    "fn",
    (input) => {
      $SFN.waitUntil(input.until);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw new Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    throw new Error("cause");
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw new Error complex", () => {
  const { stack } = initStepFunctionApp();

  expect(
    () =>
      new ExpressStepFunction<{ val: string | undefined }, void>(
        stack,
        "fn",
        (input) => {
          throw new Error(input.val ?? "cause");
        }
      )
  ).toThrow("StepFunctions error cause must be a constant");
});

test("throw Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    throw Error("cause");
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw new StepFunctionError", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    throw new StepFunctionError("CustomError", { property: "cause" });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw new functionless.StepFunctionError", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    throw new functionless.StepFunctionError("CustomError", {
      property: "cause",
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try, throw Error('error'), empty catch", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      throw Error("cause");
    } catch {}
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try, throw, empty catch", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      throw new StepFunctionError("CustomError", { property: "cause" });
    } catch {}
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try, task, empty catch", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", async () => {
    try {
      await computeScore({
        id: "id",
        name: "name",
      });
    } catch {}
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("catch and throw new Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      throw new Error("cause");
    } catch (err: any) {
      throw new StepFunctionError("CustomError", { property: "custom cause" });
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("catch and throw Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      throw Error("cause");
    } catch (err: any) {
      throw new StepFunctionError("CustomError", { property: "custom cause" });
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with inner return and no catch variable", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", async () => {
    try {
      await computeScore({
        id: "id",
        name: "name",
      });
      return "hello";
    } catch {
      return "world";
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with inner return and a catch variable", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", async () => {
    try {
      await computeScore({
        id: "id",
        name: "name",
      });
      return "hello";
    } catch (err: any) {
      return err.message;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with guaranteed throw new Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      throw new Error("cause");
    } catch (err: any) {
      if (err.message === "cause") {
        return "hello";
      } else {
        return "world";
      }
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with optional throw of an Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string>(
    stack,
    "fn",
    (input) => {
      try {
        if (input.id === "hello") {
          throw new Error("cause");
        }
        return "hello world";
      } catch (err: any) {
        if (err.message === "cause") {
          return "hello";
        } else {
          return "world";
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with optional task", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string>(
    stack,
    "fn",
    async (input) => {
      try {
        if (input.id === "hello") {
          await computeScore({
            id: input.id,
            name: "sam",
          });
        }
        return "hello world";
      } catch (err: any) {
        if (err.message === "cause") {
          return "hello";
        } else {
          return "world";
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with optional return of task", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string | number>(
    stack,
    "fn",
    async (input) => {
      try {
        if (input.id === "hello") {
          await computeScore({
            id: input.id,
            name: "sam",
          });
        }
        return "hello world";
      } catch (err: any) {
        if (err.message === "cause") {
          return "hello";
        } else {
          return "world";
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch with optional return of task", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string | number>(
    stack,
    "fn",
    async (input) => {
      try {
        if (input.id === "hello") {
          return await computeScore({
            id: input.id,
            name: "sam",
          });
        }
        return "hello world";
      } catch (err: any) {
        if (err.message === "cause") {
          return "hello";
        } else {
          return "world";
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("nested try-catch", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      try {
        throw new Error("error1");
      } catch {
        throw new Error("error2");
      }
    } catch {
      throw new Error("error3");
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw in for-of", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      // @ts-ignore
      for (const item of input.items) {
        throw new Error("err");
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch, no variable, contains for-of, throw", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", (input): string | void => {
    try {
      // @ts-ignore
      for (const item of input.items) {
        throw new Error("err");
      }
    } catch {
      return "hello";
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch, err variable, contains for-of, throw new Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", (input): string | void => {
    try {
      // @ts-ignore
      for (const item of input.items) {
        throw new Error("err");
      }
    } catch (err: any) {
      return err.message;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch, err variable, contains for-of, throw Error", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", (input): string | void => {
    try {
      // @ts-ignore
      for (const item of input.items) {
        throw Error("err");
      }
    } catch (err: any) {
      return err.message;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try-catch-finally", () => {
  const { stack, computeScore } = initStepFunctionApp();

  const definition = new ExpressStepFunction(
    stack,
    "fn",
    async (): Promise<string | void> => {
      try {
        await computeScore({
          id: "id",
          name: "name",
        });
      } catch {
      } finally {
        return "hello";
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { task } catch { throw } finally { task() }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction(
    stack,
    "fn",
    async (): Promise<string | void> => {
      try {
        await task();
      } catch {
        throw new Error("cause");
      } finally {
        await task("recover");
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { task() } catch { task() } finally { task() }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction(
    stack,
    "fn",
    async (): Promise<void> => {
      try {
        await task("1");
      } catch {
        await task("2");
      } finally {
        await task("3");
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try, throw, finally", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", (): string | void => {
    try {
      throw new Error("cause");
    } catch {
    } finally {
      return "hello";
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try, throw, catch, throw, finally, return", () => {
  const { stack } = initStepFunctionApp();

  const definition = new ExpressStepFunction(stack, "fn", (): string | void => {
    try {
      throw new Error("go");
    } catch {
      throw new Error("little");
    } finally {
      return "rock-star";
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { throw } catch { (maybe) throw } finally { task }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string | void>(
    stack,
    "fn",
    async (input) => {
      try {
        throw new Error("go");
      } catch {
        if (input.id === "sam") {
          throw new Error("little");
        }
      } finally {
        // task should run after both throws
        // for second throw, an error should be re-thrown
        await task();
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { task() } catch { (maybe) throw } finally { task }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction<{ id: string }, string | void>(
    stack,
    "fn",
    async (input) => {
      try {
        await task("1");
      } catch {
        if (input.id === "sam") {
          throw new Error("little");
        }
      } finally {
        // task should run after both throws
        // for second throw, an error should be re-thrown
        await task("2");
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { task() } catch(err) { (maybe) throw } finally { task }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction(
    stack,
    "fn",
    async (): Promise<string | void> => {
      try {
        await task("1");
      } catch (err: any) {
        if (err.message === "sam") {
          throw new Error("little");
        }
      } finally {
        // task should run after both throws
        // for second throw, an error should be re-thrown
        await task("2");
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { for-of } catch { (maybe) throw } finally { task }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", async (input): Promise<string | void> => {
    try {
      for (const item of input.items) {
        await task(item);
      }
    } catch (err: any) {
      if (err.message === "you dun' goofed") {
        throw new Error("little");
      }
    } finally {
      // task should run after both throws
      // for second throw, an error should be re-thrown
      await task("2");
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-of { try { task() } catch (err) { if(err) throw } finally { task() } }", () => {
  const { stack, task } = initStepFunctionApp();

  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", async (input): Promise<string | void> => {
    for (const item of input.items) {
      try {
        await task(item);
      } catch (err: any) {
        if (err.message === "you dun' goofed") {
          throw new Error("little");
        }
      } finally {
        // task should run after both throws
        // for second throw, an error should be re-thrown
        await task("2");
      }
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("while (cond) { cond = task() }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    let cond;
    while (cond === null) {
      cond = await task();
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("while (cond); cond = task()", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    let cond;
    while (cond === null) cond = await task();
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("let cond; do { cond = task() } while (cond)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    let cond;
    do {
      cond = await task();
    } while (cond === null);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.map(item => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return Promise.all(input.list.map((item) => task(item)));
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.forEach(item => )", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "fn",
    async (input: { list: string[] }) => {
      let a = "";
      input.list.forEach((item) => {
        a = `${a}${item}`;
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3].map(item => item)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", () => {
    return [1, 2, 3].map((item) => item);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.filter(item => item.length > 2).map(item => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return Promise.all(
      input.list.filter((item) => item.length > 2).map((item) => task(item))
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter(item => item > 2)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return [1, 2, 3, 4].filter((item) => item > 2);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter(item => item > 1 + 2)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return [1, 2, 3, 4].filter((item) => item > 1 + 2);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter((item, index) => item > index)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return [1, 2, 3, 4].filter((item, index) => item > index);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter((item, index, array) => item > 1 + 2)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return [1, 2, 3, 4].filter((item, _, arr) => item > arr[0]!);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter((item, index, array) => item > 1 + 2)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return [1, 2, 3, 4].filter((item, _, [first]) => item > first!);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter(item => item > {})", () => {
  const { stack } = initStepFunctionApp();
  const { definition } = new ExpressStepFunction(stack, "fn", async () => {
    return [{}].filter((item) => item === { a: "a" });
  });

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("[1,2,3,4].filter(item => item > {})", () => {
  const { stack } = initStepFunctionApp();
  const { definition } = new ExpressStepFunction(stack, "fn", async () => {
    return [{ value: "a" }].filter((item) => {
      const a = "a";
      const { value } = item;
      return value === a;
    });
  });

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

// https://github.com/functionless/functionless/issues/209
test("`template me ${input.value}`", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "fn",
    (input) => {
      return `template me ${input.value}`;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

// https://github.com/functionless/functionless/issues/209
test("`template me ${await task(input.value)}`", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "fn",
    async (input) => {
      return `template me ${await task(input.value)}`;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.filter(item => item.length > 2).map(item => item)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (string | null)[]
  >(stack, "fn", async (input) => {
    return input.list.filter((item) => item.length > 2).map((item) => item);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("input.list.map((item) => item).filter((item) => item.length > 2)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (string | null)[]
  >(stack, "fn", async (input) => {
    return input.list.map((item) => item).filter((item) => item.length > 2);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("closure from map", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (string | null)[]
  >(stack, "fn", async (input) => {
    const a = "x";
    return input.list.map((item) => `${a}${item}`);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("await Promise.all(input.list.map((item) => task(item)))).filter", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return (await Promise.all(input.list.map((item) => task(item)))).filter(
      (item) => item !== null
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.map((item, i) => if (i == 0) task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return Promise.all(
      input.list.map(async (item, i) => {
        if (i === 0) {
          return task(item);
        } else {
          return null;
        }
      })
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.map((item, i, list) => if (i == 0) task(item) else task(list[0]))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return Promise.all(
      input.list.map((item, i) => {
        if (i === 0) {
          return task(item);
        } else {
          return task(input.list[0]);
        }
      })
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.map(item => task(item)) }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (null | number)[] | null
  >(stack, "fn", async (input) => {
    try {
      return await Promise.all(input.list.map((item) => task(item)));
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("throw task(task())", () => {
  const { stack, task } = initStepFunctionApp();
  expect(
    () =>
      new ExpressStepFunction<{ list: string[] }, (null | number)[] | null>(
        stack,
        "fn",
        async (input) => {
          throw await task(await task(input));
        }
      )
  ).toThrow(
    "StepFunction throw must be Error or StepFunctionError class\n\nhttps://functionless.org/docs/error-codes#stepfunction-throw-must-be-error-or-stepfunctionerror-class"
  );
});

test("input.b ? task() : task(input)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ b: boolean }, null | number>(
    stack,
    "fn",
    async (input) => {
      return input.b ? task() : task(input);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for (const i in [task(input)])", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ str: string }, any | null>(
    stack,
    "fn",
    async (input) => {
      for (const i in [await task(input)]) {
        await task(await task(i));
      }
      return null;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for (const i of [task(input)])", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string }, any | null>(
    stack,
    "fn",
    async (input) => {
      for (const i of [await task(input)]) {
        await task(await task(i));
      }
      return null;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.map(item => task(item)) }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    return Promise.all(
      input.list.map((item) => {
        try {
          return task(item);
        } catch {
          return null;
        }
      })
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.map(item => throw) }", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    null | string[]
  >(stack, "fn", (input) => {
    try {
      return input.list.map(() => {
        throw new Error("cause");
      });
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.map(item => throw) } catch (err)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    string[] | number
  >(stack, "fn", (input) => {
    try {
      return input.list.map(() => {
        throw new Error("cause");
      });
    } catch (err: any) {
      if (err.message === "cause") {
        return 0;
      } else {
        return 1;
      }
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.forEach(item => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return input.list.forEach((item) => task(item));
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.forEach((item, i) => if (i == 0) task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return input.list.forEach((item, i) => {
        if (i === 0) {
          return task(item);
        } else {
          return null;
        }
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("list.forEach((item, i, list) => if (i == 0) task(item) else task(list[0]))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return input.list.forEach((item, i) => {
        if (i === 0) {
          return task(item);
        } else {
          return task(input.list[0]);
        }
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.forEach(item => task(item)) }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void | null>(
    stack,
    "fn",
    (input) => {
      try {
        return input.list.forEach((item) => task(item));
      } catch {
        return null;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.forEach(item => task(item)) }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return input.list.forEach((item) => {
        try {
          return task(item);
        } catch {
          return null;
        }
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.forEach(item => throw) }", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void | null>(
    stack,
    "fn",
    (input) => {
      try {
        return input.list.forEach(() => {
          throw new Error("cause");
        });
      } catch {
        return null;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { list.forEach(item => throw) } catch (err)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void | number>(
    stack,
    "fn",
    (input) => {
      try {
        return input.list.forEach(() => {
          throw new Error("cause");
        });
      } catch (err: any) {
        if (err.message === "cause") {
          return 0;
        } else {
          return 1;
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("$SFN.map([1, 2, 3], (item) => nitem)", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return $SFN.map([1, 2, 3], (item) => `n${item}`);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.map(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", (input) => {
    return $SFN.map(input.list, (item) => task(item));
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.map(list, {maxConcurrency: 2} (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", (input) => {
    return $SFN.map(input.list, { maxConcurrency: 2 }, (item) => task(item));
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("$SFN.map(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    async (input) => {
      await $SFN.map(input.list, async (item) => task(item));
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("result = $SFN.map(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", async (input) => {
    const result = await $SFN.map(input.list, (item) => task(item));
    return result;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.map(list, (item) => try { task(item)) } catch { return null }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[]
  >(stack, "fn", (input) => {
    return $SFN.map(input.list, (item) => {
      try {
        return task(item);
      } catch {
        return null;
      }
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { $SFN.map(list, (item) => task(item)) } catch { return null }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { list: string[] },
    (number | null)[] | null
  >(stack, "fn", (input) => {
    try {
      return $SFN.map(input.list, (item) => task(item));
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.forEach(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return $SFN.forEach(input.list, async (item) => {
        await task(item);
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.forEach(list, {maxConcurrency: 2} (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return $SFN.forEach(input.list, { maxConcurrency: 2 }, async (item) => {
        await task(item);
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("$SFN.forEach(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    async (input) => {
      await $SFN.forEach(input.list, async (item) => task(item));
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("result = $SFN.forEach(list, (item) => task(item))", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    async (input) => {
      return $SFN.forEach(input.list, async (item) => task(item));
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.forEach(list, (item) => try { task(item)) } catch { return null }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void>(
    stack,
    "fn",
    (input) => {
      return $SFN.forEach(input.list, async (item) => {
        try {
          await task(item);
        } catch {
          return;
        }
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("try { $SFN.forEach(list, (item) => task(item)) } catch { return null }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ list: string[] }, void | null>(
    stack,
    "fn",
    (input) => {
      try {
        return $SFN.forEach(input.list, async (item) => task(item));
      } catch {
        return null;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test('return $SFN.parallel(() => "hello", () => "world"))', () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    return $SFN.parallel(
      () => "hello",
      () => "world"
    );
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test('try { return $SFN.parallel(() => "hello", () => "world")) } catch { return null }', () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      return $SFN.parallel(
        () => "hello",
        () => "world"
      );
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test('try { return $SFN.parallel(() => "hello", async () => { await task(); await task(); })) } catch { return null }', () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      return $SFN.parallel(
        () => "hello",
        async () => {
          await task();
          await task();
        }
      );
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.parallel(() => try { task() } catch { return null })) }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    try {
      return $SFN.parallel(() => {
        try {
          return task();
        } catch {
          return null;
        }
      });
    } catch {
      return null;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return $SFN.parallel(() => {})) }", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    return $SFN.parallel(() => {});
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return task({ key: items.filter(*) })", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { items: { str: string; items: string[] }[] },
    number | null
  >(stack, "fn", (input) => {
    return task({
      equals: input.items.filter((item) => item.str === "hello"),
      and: input.items.filter(
        (item) => item.str === "hello" && item.items[0] === "hello"
      ),
      or: input.items.filter(
        (item) => item.str === "hello" || item.items[0] === "hello"
      ),
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("single quotes in StringLiteralExpr should be escaped in a JSON Path filter expression", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { items: { str: string; items: string[] }[] },
    number | null
  >(stack, "fn", (input) => {
    return task({
      escape: input.items.filter((item) => item.str === "hello'world"),
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("template literal strings", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { obj: { str: string; items: string } },
    number | null
  >(stack, "fn", (input) => {
    return task({
      key: `${input.obj.str} ${"hello"} ${input.obj.items[0]}`,
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("template literal strings complex", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { obj: { str?: string; items: string } },
    number | null
  >(stack, "fn", async (input) => {
    return task({
      key: `${input.obj.str ?? "default"} hello ${"hello"} ${
        input.obj.items[0] ?? (await task())
      }`,
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-in-loop variable initializer", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", (input) => {
    let x;
    for (x of input.items) {
      return x;
    }
    return;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for-of-loop variable initializer", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<
    { items: string[] },
    string | void
  >(stack, "fn", (input) => {
    let x;
    for (x in input.items) {
      return x;
    }
    return;
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("break from for-loop", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      for (const item of input.items) {
        if (item === "hello") {
          break;
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("break from while-loop", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    while (true) {
      break;
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("break from do-while-loop", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", () => {
    do {
      break;
    } while (true);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("continue in for loop", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ items: string[] }, void>(
    stack,
    "fn",
    (input) => {
      for (const item of input.items) {
        if (item === "hello") {
          continue;
        }
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("continue in while loop", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async (input) => {
      while (true) {
        if (input.key === "sam") {
          continue;
        }
        await task(input.key);
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("continue in do..while loop", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async (input) => {
      do {
        if (input.key === "sam") {
          continue;
        }
        await task(input.key);
      } while (true);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for(;;) loop", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async () => {
      for (let i = 0; i < 3; i = i === 0 ? 1 : i === 1 ? 2 : 3) {
        await task(i);
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for(;;) loop empty body", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async () => {
      for (let i = 0; i < 3; i = i === 0 ? 1 : i === 1 ? 2 : 3) {}
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for(;;) loop complex", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async () => {
      for (let i = [1, 2], j = [3, 4]; i[0]; i = i.slice(1), j = j.slice(1)) {
        await task({ i: i, j: j });
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for(;;) no statement", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async () => {
      for (;;) {
        await task();
        break;
      }
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("for(;;) empty", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ key: string }, void>(
    stack,
    "fn",
    async () => {
      for (;;) {}
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return task(await task())", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return task(await task());
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return await task(await task())", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return task(await task());
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

// https://github.com/functionless/functionless/issues/281
test("return cond ? task(1) : task(2)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction<{ cond: boolean }, number | null>(
    stack,
    "fn",
    async (input) => {
      return input.cond ? task(1) : task(2);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("return task(1) ?? task(2)", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    return (await task(1)) ?? (await task(2));
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("while(true) { try { } catch { wait }", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "fn", async () => {
    while (true) {
      try {
        await task();
      } catch {
        $SFN.waitFor(1);
      }
    }
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction(stack, "machine1", () => {
    return "hello";
  });

  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return machine1({});
  }).definition;

  expectTaskToMatch(
    definition,
    {
      Parameters: { StateMachineArn: machine1.resource.stateMachineArn },
    },
    /machine1/g
  );

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function with name and trace", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction(stack, "machine1", () => {
    return "hello";
  });

  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return machine1({
      name: "exec1",
      traceHeader: "1",
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function with name and trace from variables", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction(stack, "machine1", () => {
    return "hello";
  });

  const definition = new ExpressStepFunction(
    stack,
    "machine2",
    (input: { name: string; header: string }) => {
      return machine1({
        name: input.name,
        traceHeader: input.header,
      });
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function with input", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return machine1({
      input: {
        value: "hello",
      },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function with dynamic input", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction<
    { value1: string },
    SyncExecutionResult<string>
  >(stack, "machine2", (input) => {
    return machine1({
      input: {
        value: input.value1,
      },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function with dynamic input field input", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction<
    { value: string },
    SyncExecutionResult<string>
  >(stack, "machine2", (input) => {
    return machine1({
      input: input,
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

/**
 * Represents a situation when set functions would need to generate multiple states.
 */
test("call Step Function from another Step Function with null coalesce", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction<
    { value: string | undefined },
    SyncExecutionResult<string>
  >(stack, "machine2", (input) => {
    return machine1({
      input: { value: input.value ?? "default" },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function from another Step Function not supported with reference argument", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  expect(
    () =>
      new ExpressStepFunction<{ value1: string }, SyncExecutionResult<string>>(
        stack,
        "machine2",
        (input) => {
          const _input = {
            input: {
              value: input.value1,
            },
          };
          return machine1(_input);
        }
      )
  ).toThrow(
    "Step function invocation must use a single, inline object parameter. Variable references are not supported currently."
  );
});

test("call Step Function from another Step Function not supported with computed keys", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  expect(
    () =>
      new ExpressStepFunction<{ value1: string }, SyncExecutionResult<string>>(
        stack,
        "machine2",
        (input) => {
          const _inputStr = "input";
          return machine1({
            [_inputStr]: {
              value: input.value1,
            },
          });
        }
      )
  ).toThrow(
    "Step function invocation must use a single, inline object instantiated without computed or spread keys."
  );
});

test("call Step Function from another Step Function not supported with spread assignment", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new ExpressStepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  expect(
    () =>
      new ExpressStepFunction<{ value1: string }, SyncExecutionResult<string>>(
        stack,
        "machine2",
        (input) => {
          const _input = {
            input: {
              value: input.value1,
            },
          };
          return machine1({ ..._input });
        }
      )
  ).toThrow(
    "Step function invocation must use a single, inline object instantiated without computed or spread keys."
  );
});

test("call Step Function describe from another Step Function", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new StepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return machine1.describeExecution("hello");
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("call Step Function describe from another Step Function from context", () => {
  const { stack } = initStepFunctionApp();
  const machine1 = new StepFunction<{ value: string }, string>(
    stack,
    "machine1",
    () => {
      return "hello";
    }
  );

  const definition = new ExpressStepFunction(
    stack,
    "machine2",
    (input: { id: string }) => {
      return machine1.describeExecution(input.id);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("on success event", () => {
  const machine = new StepFunction(stack, "machine", () => {});

  const success = machine.onSucceeded(stack, "onSuccess");

  expect(success.resource._renderEventPattern()).toEqual({
    source: ["aws.states"],
    "detail-type": ["Step Functions Execution Status Change"],
    detail: {
      status: ["SUCCEEDED"],
      stateMachineArn: [machine.resource.stateMachineArn],
    },
  });
});

test("on status change event", () => {
  const machine = new StepFunction(stack, "machine", () => {});

  const statusChange = machine.onStatusChanged(stack, "onSuccess");

  expect(statusChange.resource._renderEventPattern()).toEqual({
    source: ["aws.states"],
    "detail-type": ["Step Functions Execution Status Change"],
    detail: {
      stateMachineArn: [machine.resource.stateMachineArn],
    },
  });
});

test("on status change event refine", () => {
  const machine = new StepFunction(stack, "machine", () => {});

  const success = machine
    .onStatusChanged(stack, "onStatus")
    .when(stack, "onRunning", (event) => event.detail.status === "RUNNING");

  expect(success.resource._renderEventPattern()).toEqual({
    source: ["aws.states"],
    "detail-type": ["Step Functions Execution Status Change"],
    detail: {
      status: ["RUNNING"],
      stateMachineArn: [machine.resource.stateMachineArn],
    },
  });
});

test("import from state machine", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
  });
  const machine = StepFunction.fromStateMachine<{ id: string }, string>(
    awsMachine
  );

  new Function(stack, "func", async () => {
    await machine({
      input: {
        id: "hi",
      },
    });
  });
});

test("import from state machine into state machine", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
  });
  const machine = StepFunction.fromStateMachine<{ id: string }, string>(
    awsMachine
  );

  const definition = new StepFunction(stack, "func", async () => {
    await machine({
      input: {
        id: "hi",
      },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();

  expectTaskToMatch(
    definition,
    {
      Parameters: {
        StateMachineArn: awsMachine.stateMachineArn,
      },
    },
    "machine"
  );
});

test("import express from standard should fail", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
    stateMachineType: aws_stepfunctions.StateMachineType.EXPRESS,
  });

  expect(() =>
    StepFunction.fromStateMachine<{ id: string }, string>(awsMachine)
  ).toThrow(new SynthError(ErrorCodes.Incorrect_StateMachine_Import_Type));
});

test("import from express state machine", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
    stateMachineType: aws_stepfunctions.StateMachineType.EXPRESS,
  });
  const machine = ExpressStepFunction.fromStateMachine<{ id: string }, string>(
    awsMachine
  );

  new Function(stack, "func", async () => {
    await machine({
      input: {
        id: "hi",
      },
    });
  });
});

test("import from express state machine into machine", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
    stateMachineType: aws_stepfunctions.StateMachineType.EXPRESS,
  });
  const machine = ExpressStepFunction.fromStateMachine<{ id: string }, string>(
    awsMachine
  );

  const definition = new StepFunction(stack, "func", async () => {
    await machine({
      input: {
        id: "hi",
      },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();

  expectTaskToMatch(
    definition,
    {
      Parameters: {
        StateMachineArn: awsMachine.stateMachineArn,
      },
    },
    "machine"
  );
});

test("import standard from express should fail", () => {
  const awsMachine = new aws_stepfunctions.StateMachine(stack, "m", {
    definition: new Pass(stack, "p"),
    stateMachineType: aws_stepfunctions.StateMachineType.STANDARD,
  });

  expect(() =>
    ExpressStepFunction.fromStateMachine<{ id: string }, string>(awsMachine)
  ).toThrow(new SynthError(ErrorCodes.Incorrect_StateMachine_Import_Type));
});

test("stringify json", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "machine2",
    (input: { id: string }) => {
      return JSON.stringify(input);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("stringify undefined 2", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return JSON.stringify(undefined);
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("stringify object literal", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return JSON.stringify({
      a: "a",
      b: {
        c: "c",
      },
    });
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("parse json", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(stack, "machine2", () => {
    return JSON.parse("{ a: 'a', b: { c: 'c' } }");
  }).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("Boolean", () => {
  const { stack } = initStepFunctionApp();
  const definition = new ExpressStepFunction(
    stack,
    "machine2",
    (input: { value: string }) => {
      return {
        trueString: Boolean("1"),
        trueBoolean: Boolean(true),
        trueNumber: Boolean(1),
        trueObject: Boolean({}),
        falseString: Boolean(""),
        falseBoolean: Boolean(false),
        falseNumber: Boolean(0),
        empty: Boolean(),
        var: Boolean(input.value),
      };
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("use context parameter", () => {
  const { stack } = initStepFunctionApp();
  const definition = new StepFunction<{ value: string }, string>(
    stack,
    "machine1",
    (_, context) => {
      return context.Execution.Name;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("use context parameter in template", () => {
  const { stack } = initStepFunctionApp();
  const definition = new StepFunction<{ value: string }, string>(
    stack,
    "machine1",
    (_, context) => {
      return `name: ${context.Execution.Id}`;
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("use context parameter in function call", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new StepFunction<{ value: string }, number | null>(
    stack,
    "machine1",
    async (_, context) => {
      return task(context.Execution.Id);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("use context object", () => {
  const { stack, task } = initStepFunctionApp();
  const definition = new StepFunction<{ value: string }, number | null>(
    stack,
    "machine1",
    async (_, context) => {
      return task(context);
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

test("use context in object", () => {
  const { stack } = initStepFunctionApp();
  const definition = new StepFunction<{ value: string }, { a: string }>(
    stack,
    "machine1",
    async (_, context) => {
      return {
        a: context.Execution.Name,
      };
    }
  ).definition;

  expect(normalizeDefinition(definition)).toMatchSnapshot();
});

describe("binding", () => {
  describe("prop", () => {
    test("binding", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async ({ value }) => {
          return value;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("with default", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async ({ value = "b" }) => {
          return value;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("with self default", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: string; value2: string | undefined },
        string
      >(stack, "machine1", async ({ value, value2 = value }) => {
        return value2;
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("nested", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: { b: string } }, string>(
        stack,
        "machine1",
        async ({ value: { b } }) => {
          return b;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("array", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { arr: string[] },
        string | undefined
      >(stack, "machine1", async ({ arr: [b] }) => {
        return b;
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("array rest", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ arr: string[] }, string[]>(
        stack,
        "machine1",
        async ({ arr: [, ...b] }) => {
          return b;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("rename", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async ({ value: b }) => {
          return b;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });
  });

  describe("variable", () => {
    test("binding", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async (input) => {
          const { value } = input;
          return value;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("with default", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async (input) => {
          const { value = "b" } = input;
          return value;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("nested", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: { b: string } }, string>(
        stack,
        "machine1",
        async (input) => {
          const {
            value: { b },
          } = input;
          return b;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("array", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { arr: string[] },
        string | undefined
      >(stack, "machine1", async (input) => {
        const {
          arr: [b],
        } = input;
        return b;
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("rename", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<{ value: string }, string>(
        stack,
        "machine1",
        async (input) => {
          const { value: b } = input;
          return b;
        }
      ).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });
  });

  describe("functions", () => {
    test("use in map", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: string; obj: { value: string } },
        string
      >(stack, "machine1", async ({ value, obj }) => {
        const { value: v } = obj;
        return [1, 2, 3].map(() => `${value}${v}`).join();
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("map", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: { value: string; arr: string[] }[] },
        string
      >(stack, "machine1", async (input) => {
        return input.value.map(({ value: b, arr: [c] }) => `${b}${c}`).join();
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("forEach", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: { value: string; arr: string[] }[] },
        string
      >(stack, "machine1", async (input) => {
        input.value.forEach(({ value: b, arr: [c] }) => `${b}${c}`);
        return "success";
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("$SFN.map", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: { value: string; arr: string[] }[] },
        string
      >(stack, "machine1", async (input) => {
        return (
          await $SFN.map(input.value, ({ value: b, arr: [c] }) => `${b}${c}`)
        ).join();
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("$SFN.forEach", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: { value: string; arr: string[] }[] },
        string
      >(stack, "machine1", async (input) => {
        await $SFN.forEach(input.value, ({ value: b, arr: [c] }) => `${b}${c}`);
        return "success";
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });

    test("filter", () => {
      const { stack } = initStepFunctionApp();
      const definition = new StepFunction<
        { value: { value: string; arr: string[] }[] },
        { value: string; arr: string[] }[]
      >(stack, "machine1", async (input) => {
        return input.value.filter(({ value: b, arr: [c] }) => b === c);
      }).definition;

      expect(normalizeDefinition(definition)).toMatchSnapshot();
    });
  });

  test("forOf", () => {
    const { stack } = initStepFunctionApp();
    const definition = new StepFunction<
      { value: { key: string; value: string }[] },
      string
    >(stack, "machine1", async (input) => {
      let a = "";
      for (const { key, value } of input.value) {
        a = `${key}${value}${a}`;
      }
      return a;
    }).definition;

    expect(normalizeDefinition(definition)).toMatchSnapshot();
  });

  test("forOf weird values", () => {
    const { stack } = initStepFunctionApp();
    const definition = new StepFunction<{ value?: number[] }, string>(
      stack,
      "machine1",
      async (input) => {
        let a = "";
        for (const val of input.value ?? [1, 2, 3]) {
          a = `${val}${a}`;
        }
        for (const val of input.value || [1, 2, 3]) {
          a = `${val}${a}`;
        }
        for (const val of ((a = "b"), true) && [1, 2, 3]) {
          a = `${val}${a}`;
        }
        return a;
      }
    ).definition;

    expect(normalizeDefinition(definition)).toMatchSnapshot();
  });

  test("for", () => {
    const { stack } = initStepFunctionApp();
    const definition = new StepFunction(stack, "machine1", async () => {
      for (const { key, value } = { key: "x", value: "y" }; ; ) {
        return `${key}${value}`;
      }
    }).definition;

    expect(normalizeDefinition(definition)).toMatchSnapshot();
  });

  test("catch", () => {
    const { stack, computeScore } = initStepFunctionApp();

    const definition = new ExpressStepFunction(stack, "fn", async () => {
      try {
        await computeScore({
          id: "id",
          name: "name",
        });
        return "hello";
      } catch ({ message }) {
        return message;
      }
    }).definition;

    expect(normalizeDefinition(definition)).toMatchSnapshot();
  });
});

test("throw SynthError when for-await is used", () => {
  const { stack } = initStepFunctionApp();

  expect(() => {
    new StepFunction(stack, "MyStepF", async () => {
      for await (const _ of []) {
      }
    });
  }).toThrow("Step Functions does not yet support for-await");
});

test("throw SynthError when rest parameter is used", () => {
  const { stack } = initStepFunctionApp();

  expect(() => {
    new StepFunction(stack, "MyStepF", async (input: { prop: string[] }) => {
      return input.prop.map((...rest) => {
        return rest;
      });
    });
  }).toThrow("Step Functions does not yet support rest parameters");
});
