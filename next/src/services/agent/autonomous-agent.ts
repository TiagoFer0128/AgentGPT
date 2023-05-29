import axios from "axios";
import type { ModelSettings } from "../../utils/types";
import { DEFAULT_MAX_LOOPS_FREE } from "../../utils/constants";
import type { Session } from "next-auth";
import { v1, v4 } from "uuid";
import type { AgentMode, AgentPlaybackControl, Message, Task } from "../../types/agentTypes";
import { AGENT_PAUSE, AGENT_PLAY, AUTOMATIC_MODE, PAUSE_MODE } from "../../types/agentTypes";
import { useMessageStore } from "../../stores";
import { translate } from "../../utils/translations";
import { AgentApi } from "./agent-api";
import MessageService from "./message-service";

const TIMEOUT_LONG = 1000;
const TIMOUT_SHORT = 800;

class AutonomousAgent {
  name: string;
  goal: string;
  completedTasks: string[] = [];
  modelSettings: ModelSettings;
  isRunning = false;
  renderMessage: (message: Message) => void;
  handlePause: (opts: { agentPlaybackControl?: AgentPlaybackControl }) => void;
  shutdown: () => void;
  numLoops = 0;
  session?: Session;
  _id: string;
  mode: AgentMode;
  playbackControl: AgentPlaybackControl;
  messageService: MessageService;
  $api: AgentApi;

  constructor(
    name: string,
    goal: string,
    renderMessage: (message: Message) => void,
    handlePause: (opts: { agentPlaybackControl?: AgentPlaybackControl }) => void,
    shutdown: () => void,
    modelSettings: ModelSettings,
    mode: AgentMode,
    session?: Session,
    playbackControl?: AgentPlaybackControl
  ) {
    this.name = name;
    this.goal = goal;
    this.renderMessage = renderMessage;
    this.handlePause = handlePause;
    this.shutdown = shutdown;
    this.modelSettings = modelSettings;
    this.session = session;
    this._id = v4();
    this.mode = mode || AUTOMATIC_MODE;
    this.playbackControl = playbackControl || this.mode == PAUSE_MODE ? AGENT_PAUSE : AGENT_PLAY;

    this.messageService = new MessageService(renderMessage);

    this.$api = new AgentApi(
      {
        goal,
        modelSettings,
      },
      this.onApiError
    );
  }

  async run() {
    if (!this.isRunning) {
      this.updateIsRunning(true);
      await this.startGoal();
    }

    await this.loop();
    if (this.mode === PAUSE_MODE && !this.isRunning) {
      this.handlePause({ agentPlaybackControl: this.playbackControl });
    }
  }

  async startGoal() {
    this.messageService.sendGoalMessage(this.goal);
    this.messageService.sendThinkingMessage();

    // Initialize by getting taskValues
    try {
      const taskValues = await this.$api.getInitialTasks();
      for (const value of taskValues) {
        await new Promise((r) => setTimeout(r, TIMOUT_SHORT));
        this.messageService.sendMessage({
          taskId: v1().toString(),
          value,
          status: "started",
          type: "task",
        });
      }
    } catch (e) {
      console.log(e);
      this.messageService.sendErrorMessage(getMessageFromError(e));
      this.shutdown();
      return;
    }
  }

  async loop() {
    this.conditionalPause();

    if (!this.isRunning) {
      return;
    }

    if (this.getRemainingTasks().length === 0) {
      this.messageService.sendCompletedMessage();
      this.shutdown();
      return;
    }

    this.numLoops += 1;
    const maxLoops = this.maxLoops();
    if (this.numLoops > maxLoops) {
      this.messageService.sendLoopMessage();
      this.shutdown();
      return;
    }

    // Wait before starting
    await new Promise((r) => setTimeout(r, TIMEOUT_LONG));

    // Start with first task
    const currentTask = this.getRemainingTasks()[0] as Task;

    this.messageService.sendMessage({ ...currentTask, status: "executing" });
    this.messageService.sendThinkingMessage();

    // Analyze how to execute a task: Reason, web search, other tools...
    const analysis = await this.$api.analyzeTask(currentTask.value);
    this.messageService.sendAnalysisMessage(analysis);

    const result = await this.$api.executeTask(currentTask.value, analysis);
    this.messageService.sendMessage({
      ...currentTask,
      info: result,
      status: "completed",
    });

    this.completedTasks.push(currentTask.value || "");

    // Wait before adding tasks
    await new Promise((r) => setTimeout(r, TIMEOUT_LONG));
    this.messageService.sendThinkingMessage();

    // Add new tasks
    try {
      const newTasks = await this.$api.getAdditionalTasks(
        {
          current: currentTask.value,
          remaining: this.getRemainingTasks().map((task) => task.value),
          completed: this.completedTasks,
        },
        result
      );
      for (const value of newTasks) {
        await new Promise((r) => setTimeout(r, TIMOUT_SHORT));
        this.messageService.sendMessage({
          taskId: v1().toString(),
          value,
          status: "started",
          type: "task",
        });
      }

      if (newTasks.length == 0) {
        this.messageService.sendMessage({ ...currentTask, status: "final" });
      }
    } catch (e) {
      console.error(e);
      this.messageService.sendErrorMessage(translate("ERROR_ADDING_ADDITIONAL_TASKS", "errors"));
      this.messageService.sendMessage({ ...currentTask, status: "final" });
    }
    await this.loop();
  }

  getRemainingTasks(): Task[] {
    return useMessageStore.getState().tasks.filter((t: Task) => t.status === "started");
  }

  private conditionalPause() {
    if (this.mode != PAUSE_MODE) {
      return;
    }

    // decide whether to pause agent when pause mode is enabled
    this.isRunning = !(this.playbackControl === AGENT_PAUSE);

    // reset playbackControl to pause so agent pauses on next set of task(s)
    if (this.playbackControl === AGENT_PLAY) {
      this.playbackControl = AGENT_PAUSE;
    }
  }

  private maxLoops() {
    return this.modelSettings.customMaxLoops || DEFAULT_MAX_LOOPS_FREE;
  }

  updatePlayBackControl(newPlaybackControl: AgentPlaybackControl) {
    this.playbackControl = newPlaybackControl;
  }

  updateIsRunning(isRunning: boolean) {
    this.messageService.setIsRunning(isRunning);
    this.isRunning = isRunning;
  }

  stopAgent() {
    this.messageService.sendManualShutdownMessage();
    this.updateIsRunning(false);
    this.shutdown();
    return;
  }

  private onApiError = (e: unknown) => {
    // TODO: handle retries here
    this.shutdown();
    throw e;
  };
}

const getMessageFromError = (e: unknown) => {
  let message = "ERROR_RETRIEVE_INITIAL_TASKS";

  if (axios.isAxiosError(e)) {
    if (e.response?.status === 429) message = "ERROR_API_KEY_QUOTA";
    if (e.response?.status === 404) message = "ERROR_OPENAI_API_KEY_NO_GPT4";
    else message = "ERROR_ACCESSING_OPENAI_API_KEY";
  }

  return translate(message, "errors");
};

export default AutonomousAgent;
