import type { Node } from "reactflow";
import { z } from "zod";

import type { WorkflowNode } from "../../types/workflow";

const IOFieldSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(["string", "array"]),
  items: z.object({ type: z.string() }).optional(),
});

export type IOField = z.infer<typeof IOFieldSchema>;

export const NodeBlockDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  image_url: z.string(),
  input_fields: z.array(IOFieldSchema),
  output_fields: z.array(IOFieldSchema),
});

export type NodeBlockDefinition = z.infer<typeof NodeBlockDefinitionSchema>;

const UrlStatusCheckBlockDefinition: NodeBlockDefinition = {
  name: "URL Status Check",
  type: "UrlStatusCheck",
  description: "Check the status of a URL",
  image_url: "/tools/web.png",
  input_fields: [
    {
      name: "url",
      description: "The URL to check",
      type: "string",
    },
  ],
  output_fields: [
    {
      name: "url",
      description: "The URL to check",
      type: "string",
    },
    {
      name: "code",
      description: "The HTTP status code",
      type: "string",
    },
  ],
};

const SlackWebhookBlockDefinition: NodeBlockDefinition = {
  name: "Slack Message Webhook",
  type: "SlackWebhook",
  description: "Sends a message to a slack webhook",
  image_url: "/tools/web.png",
  input_fields: [
    {
      name: "url",
      description: "The Slack WebHook URL",
      type: "string",
    },
    {
      name: "message",
      description: "The message to send",
      type: "string",
    },
  ],
  output_fields: [
    {
      name: "message",
      description: "The message that was sent",
      type: "string",
    },
  ],
};

const SummaryWebhookBlockDefinition: NodeBlockDefinition = {
  name: "Summary Agent",
  type: "SummaryWebhook",
  description: "Summarize or extract key details from text using OpenAI",
  image_url: "/tools/web.png",
  input_fields: [
    {
      name: "prompt",
      description: "What do you want to do with the text?",
      type: "string",
    },
    {
      name: "filename",
      description: "reference a file that you want to summarize",
      type: "string",
    },
  ],
  output_fields: [
    {
      name: "result",
      description: "The result was built.",
      type: "string",
    },
  ],
};

const TextInputWebhookBlockDefinition: NodeBlockDefinition = {
  name: "Text Input",
  type: "TextInputWebhook",
  description: "",
  image_url: "/tools/web.png",
  input_fields: [
    {
      name: "text",
      description: "What text would you like to extract information from?",
      type: "string",
    },
  ],
  output_fields: [
    {
      name: "result",
      description: "The result was built.",
      type: "string",
    },
  ],
};

const IfBlockDefinition: NodeBlockDefinition = {
  name: "If Condition",
  type: "IfCondition",
  description: "Conditionally take a path",
  image_url: "/tools/web.png",
  input_fields: [],
  output_fields: [],
};

const TriggerBlockDefinition: NodeBlockDefinition = {
  name: "Manual Trigger",
  type: "ManualTriggerBlock",
  description: "Trigger a block manually",
  image_url: "/tools/web.png",
  input_fields: [],
  output_fields: [],
};

const WebInteractionAgent: NodeBlockDefinition = {
  name: "Web Interaction Agent",
  type: "WebInteractionAgent",
  description:
    "Takes a URL, dynamically interacts with the site given guidance, and returns some results.",
  image_url: "/tools/web.png",
  input_fields: [
    {
      name: "url",
      description: "The website the agent will interact with",
      type: "string",
    },
    {
      name: "goals",
      description: "The actions the agent should take on the site",
      type: "string",
    },
  ],
  output_fields: [],
};

export const getNodeBlockDefinitions = () => {
  return [
    UrlStatusCheckBlockDefinition,
    SlackWebhookBlockDefinition,
    IfBlockDefinition,
    WebInteractionAgent,
    TriggerBlockDefinition,
    SummaryWebhookBlockDefinition,
    TextInputWebhookBlockDefinition,
  ];
};

export const getNodeBlockDefinitionFromNode = (node: Node<WorkflowNode>) => {
  return getNodeBlockDefinitions().find((d) => d.type === node.data.block.type);
};
