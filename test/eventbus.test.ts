import { aws_events, aws_lambda, Stack } from "aws-cdk-lib";
import { ExpressStepFunction, StepFunction } from "../src";
import { EventBus, EventBusRule, EventBusRuleInput } from "../src/event-bridge";
import { EventBusTransform } from "../src/event-bridge/transform";
import { Function } from "../src/function";

let stack: Stack;

beforeEach(() => {
  stack = new Stack();
});

test("new bus from aws bus", () => {
  const bus = new aws_events.EventBus(stack, "bus");

  EventBus.fromBus(bus);
});

test("new bus without wrapper", () => {
  new EventBus(stack, "bus");
});

test("new rule without when", () => {
  const bus = new EventBus(stack, "bus");

  const rule = new EventBusRule(stack, "rule", bus, (_event) => true);

  expect(rule.rule._renderEventPattern()).toEqual({ source: [{ prefix: "" }] });
});

test("new transform without map", () => {
  const bus = new EventBus(stack, "bus");

  const rule = new EventBusRule(stack, "rule", bus, (_event) => true);
  const transform = new EventBusTransform((event) => event.source, rule);

  expect(transform.targetInput.bind(rule.rule)).toEqual({
    inputPath: "$.source",
  } as aws_events.RuleTargetInputProperties);
});

test("rule from existing rule", () => {
  const awsRule = new aws_events.Rule(stack, "rule");

  const rule = EventBusRule.fromRule(awsRule);
  const transform = new EventBusTransform((event) => event.source, rule);

  expect(transform.targetInput.bind(rule.rule)).toEqual({
    inputPath: "$.source",
  } as aws_events.RuleTargetInputProperties);
});

test("new bus with when", () => {
  const rule = new EventBus(stack, "bus").when(stack, "rule", () => true);

  expect(rule.rule._renderEventPattern()).toEqual({ source: [{ prefix: "" }] });
});

test("refine rule", () => {
  const rule = new EventBus(stack, "bus").when(
    stack,
    "rule",
    (event) => event.source === "lambda"
  );
  const rule2 = rule.when(
    stack,
    "rule1",
    (event) => event["detail-type"] === "something"
  );

  expect(rule2.rule._renderEventPattern()).toEqual({
    source: ["lambda"],
    "detail-type": ["something"],
  });
});

test("new bus with when pipe event bus", () => {
  const busBus = new EventBus(stack, "bus");

  const rule = busBus.when(stack, "rule", () => true);
  rule.pipe(busBus);

  expect((rule.rule as any).targets.length).toEqual(1);
  expect(
    (rule.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("refined bus with when pipe event bus", () => {
  const busBus = new EventBus(stack, "bus");

  const rule = busBus.when(stack, "rule", (event) => event.source === "lambda");
  const rule2 = rule.when(
    stack,
    "rule1",
    (event) => event["detail-type"] === "something"
  );
  rule2.pipe(busBus);

  expect((rule.rule as any).targets.length).toEqual(0);
  expect((rule2.rule as any).targets.length).toEqual(1);
  expect(
    (rule2.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("new bus with when map pipe function", () => {
  const busBus = new EventBus(stack, "bus");

  const func = new Function(
    aws_lambda.Function.fromFunctionArn(stack, "func", "")
  );

  const rule = busBus
    .when(stack, "rule", () => true)
    .map((event) => event.source);
  rule.pipe(func);

  expect(rule.targetInput.bind(rule.rule.rule)).toEqual({
    inputPath: "$.source",
  } as aws_events.RuleTargetInputProperties);
  expect((rule.rule.rule as any).targets.length).toEqual(1);
  expect(
    (rule.rule.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("refined bus with when pipe function", () => {
  const func = new Function(
    aws_lambda.Function.fromFunctionArn(stack, "func", "")
  );
  const rule = new EventBus(stack, "bus").when(
    stack,
    "rule",
    (event) => event.source === "lambda"
  );
  const rule2 = rule.when(
    stack,
    "rule1",
    (event) => event["detail-type"] === "something"
  );
  const map = rule2.map((event) => event.source);
  map.pipe(func);

  expect((rule.rule as any).targets.length).toEqual(0);
  expect((rule2.rule as any).targets.length).toEqual(1);
  expect(
    (map.rule.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("new bus with when map pipe step function", () => {
  const busBus = new EventBus(stack, "bus");

  const func = new StepFunction<{ source: string }, void>(
    stack,
    "sfn",
    () => {}
  );

  const rule = busBus
    .when(stack, "rule", () => true)
    .map((event) => ({ source: event.source }));
  rule.pipe(func);

  expect(stack.resolve(rule.targetInput.bind(rule.rule.rule))).toEqual({
    inputPathsMap: { source: "$.source" },
    inputTemplate: `{\"source\":<source>}`,
  } as aws_events.RuleTargetInputProperties);
  expect((rule.rule.rule as any).targets.length).toEqual(1);
  expect(
    (rule.rule.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("new bus with when map pipe express step function", () => {
  const busBus = new EventBus(stack, "bus");

  const func = new ExpressStepFunction<{ source: string }, void>(
    stack,
    "sfn",
    () => {}
  );

  const rule = busBus
    .when(stack, "rule", () => true)
    .map((event) => ({ source: event.source }));
  rule.pipe(func);

  expect(stack.resolve(rule.targetInput.bind(rule.rule.rule))).toEqual({
    inputPathsMap: { source: "$.source" },
    inputTemplate: `{\"source\":<source>}`,
  } as aws_events.RuleTargetInputProperties);
  expect((rule.rule.rule as any).targets.length).toEqual(1);
  expect(
    (rule.rule.rule as any).targets[0] as aws_events.IRuleTarget
  ).toHaveProperty("arn");
});

test("new bus with when map pipe function props", () => {
  const busBus = new EventBus(stack, "bus");

  const func = new Function(
    aws_lambda.Function.fromFunctionArn(stack, "func", "")
  );

  const rule = busBus
    .when(stack, "rule", () => true)
    .map((event) => event.source);
  rule.pipe({ func, retryAttempts: 10 });

  expect(rule.targetInput.bind(rule.rule.rule)).toEqual({
    inputPath: "$.source",
  } as aws_events.RuleTargetInputProperties);
  expect((rule.rule.rule as any).targets.length).toEqual(1);
  expect(
    (rule.rule.rule as any).targets[0] as aws_events.RuleTargetConfig
  ).toHaveProperty("arn");
  expect(
    ((rule.rule.rule as any).targets[0] as aws_events.RuleTargetConfig)
      .retryPolicy?.maximumRetryAttempts
  ).toEqual(10);
});

interface t1 {
  type: "one";
  one: string;
}

interface t2 {
  type: "two";
  two: string;
}

interface tt extends EventBusRuleInput<t1 | t2> {}

test("when narrows type to map", () => {
  const bus = EventBus.default<tt>(stack);

  bus
    .when(
      stack,
      "rule",
      (event): event is EventBusRuleInput<t1> => event.detail.type === "one"
    )
    .map((event) => event.detail.one);
});

test("when narrows type to map", () => {
  const bus = EventBus.default<tt>(stack);

  bus
    .when(
      stack,
      "rule",
      (event): event is EventBusRuleInput<t2> => event.detail.type === "two"
    )
    .when(stack, "rule2", (event) => event.detail.two === "something");
});

test("map narrows type and pipe enforces", () => {
  const lambda = new Function<string, void>(
    aws_lambda.Function.fromFunctionArn(stack, "func", "")
  );
  const bus = EventBus.default<tt>(stack);

  bus
    .when(
      stack,
      "rule",
      (event): event is EventBusRuleInput<t1> => event.detail.type === "one"
    )
    .map((event) => event.detail.one)
    // should fail compilation if the types don't match
    .pipe(lambda);
});