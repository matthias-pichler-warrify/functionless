import { App, aws_lambda, Stack } from "aws-cdk-lib";
import { clientConfig, deployStack } from "./localstack";
import { Function } from "../src";
import { Lambda } from "aws-sdk";
import { Construct } from "constructs";

jest.setTimeout(500000);

// const CF = new CloudFormation(clientConfig);
const lambda = new Lambda(clientConfig);
let stack: Stack;
let app: App;

// Inspiration: https://github.com/aws/aws-cdk/pull/18667#issuecomment-1075348390
beforeAll(async () => {
  app = new App();
  stack = new Stack(app, "testStack2", {
    env: {
      account: "000000000000",
      region: "us-east-1",
    },
  });

  new Function(
    new aws_lambda.Function(stack, "testFunc", {
      code: aws_lambda.Code.fromInline(`
    exports.handler = async (event) => {
        console.log('event: ', event)
      };
    `),
      runtime: aws_lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
    })
  );

  tests.forEach(({ resources }, i) => {
    const construct = new Construct(stack, `parent${i}`);
    resources(construct);
  });

  await deployStack(app, stack);
});

interface ResourceTest {
  name: string;
  resources: (parent: Construct) => void;
  test: () => Promise<void>;
}

const tests: ResourceTest[] = [];

/**
 * Allow for a suit of tests that deploy a single stack once and test the results in separate test cases.
 */
const testResource = (
  name: string,
  resources: ResourceTest["resources"],
  test: ResourceTest["test"]
) => {
  tests.push({ name, resources, test });
};

testResource(
  "Call Lambda",
  (parent) => {
    new Function(parent, "func2", async (event) => event, {
      functionName: "func2",
    });
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func2",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`{}
`);
  }
);

testResource(
  "Call Lambda from closure",
  (parent) => {
    const create = () =>
      new Function(parent, "function", async (event) => event, {
        functionName: "func3",
      });
    create();
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func3",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`{}
`);
  }
);

testResource(
  "Call Lambda from closure with variables",
  (parent) => {
    const create = () => {
      const val = "a";
      new Function(parent, "function", async () => val, {
        functionName: "func4",
      });
    };

    create();
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func4",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`"a"
`);
  }
);

testResource(
  "Call Lambda from closure with parameter",
  (parent) => {
    const create = (val: string) => {
      new Function(parent, "func5", async () => val, {
        functionName: "func5",
      });
    };

    create("b");
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func5",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`"b"
`);
  }
);

testResource(
  "Call Lambda from closure with parameter multiple",
  (parent) => {
    const create = (id: string, val: string) => {
      new Function(parent, id, async () => val, {
        functionName: id,
      });
    };

    create("func6", "c");
    create("func7", "d");
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func6",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`"c"
`);

    const result2 = await lambda
      .invoke({
        FunctionName: "func7",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result2.Payload).toEqual(`"d"
`);
  }
);

testResource(
  "Call Lambda with object",
  (parent) => {
    const create = () => {
      const obj = { val: 1 };
      new Function(parent, "function", async () => obj.val, {
        functionName: "func8",
      });
    };

    create();
  },
  async () => {
    const result = await lambda
      .invoke({
        FunctionName: "func8",
        Payload: JSON.stringify({}),
      })
      .promise();

    expect(result.Payload).toEqual(`1
`);
  }
);

// Leave me at the end please.
tests.forEach(({ name, test: testFunc }) => {
  test(name, testFunc);
});