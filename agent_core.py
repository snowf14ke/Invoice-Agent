"""
Shared agent core — a LangGraph ReAct loop + tool interface.

This is the reusable heart that BOTH the document agent and the PR assistant
sit on. The agent loop and the tool interface never change; only the tool
bodies (and later, where they read data from) do.

Run it (needs SUPABASE_URI + OPEN_AI_API + DEEPSEEK_API_KEY in .env, and a populated DB —
seed it with prepare_db.ipynb, which calls pipeline.ingest_document):
    python agent_core.py
"""

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_deepseek import ChatDeepSeek
# from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition
import os 
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('OPEN_AI_API')
os.environ.setdefault("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", "")) 
# --- 1. TOOLS ----------------------------------------------------------------
# The tool seam: identical names/docstrings/signatures to the old stubs, but the
# bodies now read live Supabase data on the `documents` schema. The agent loop,
# the graph, and the model's tool-routing don't change — see tools.py / db.py.
from tools import TOOLS


# --- 2. THE MODEL, WITH TOOLS BOUND ------------------------------------------
# bind_tools() hands the tool schemas to the model so it CAN request a call.
# Important: the model never runs a tool. It only emits a request ("call
# query_fields with vendor='Acme'"); YOUR code (the ToolNode below) runs it.

# llm = ChatGoogleGenerativeAI(
#     model="gemini-3.5-flash",          # valid current id (the dubious gemini-3.5-flash isn't)
#     temperature=0,
#     max_retries=2,
#     google_api_key=api_key,
# )
# llm = ChatOpenAI(
#     model="gpt-5.4-mini",
#     api_key=api_key,
#     temperature=0.0,
#     max_tokens=150
# )
llm = ChatDeepSeek(
    model="deepseek-v4-flash",
    temperature=0,
    max_tokens=1024
)
llm_with_tools = llm.bind_tools(TOOLS)


# --- 3. THE AGENT NODE -------------------------------------------------------
# One turn of "the LLM looks at the whole conversation and decides what to do".
# MessagesState is a built-in state holding a `messages` list; returning a
# message appends it (the reducer does that bookkeeping for you).
def agent(state: MessagesState):
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}


# --- 4. WIRE THE GRAPH = THE LOOP --------------------------------------------
# These four lines are exactly the diagram: start -> agent -> (tool or done) ->
# tool -> back to agent, repeating until the model answers instead of calling.
builder = StateGraph(MessagesState)
builder.add_node("agent", agent)
builder.add_node("tools", ToolNode(TOOLS))   # prebuilt: runs whichever tool the LLM asked for

builder.add_edge(START, "agent")
# tools_condition is the conditional edge: if the agent's last message contains
# tool calls -> go to "tools"; otherwise the agent is finished -> END.
builder.add_conditional_edges("agent", tools_condition)
builder.add_edge("tools", "agent")           # after a tool runs, loop back to the agent

graph = builder.compile()


# --- 5. ENTRY POINT FOR THE API ----------------------------------------------
def answer(question: str) -> dict:
    """Run the agent on one question. Returns the final answer plus a structured
    trace of the ReAct loop — each tool call the model requested paired (by
    tool_call_id) with the result our code fed back. The web demo renders this
    trace so visitors can SEE the loop; `sources` stays for back-compat."""
    from langchain_core.messages import AIMessage, ToolMessage
    msgs = graph.invoke({"messages": [HumanMessage(content=question)]})["messages"]
    final = next((m.content for m in reversed(msgs)
                  if isinstance(m, AIMessage) and m.content), "")
    results = {m.tool_call_id: m.content for m in msgs if isinstance(m, ToolMessage)}
    trace = [{"tool": tc["name"], "args": tc["args"], "result": results.get(tc["id"], "")}
             for m in msgs if isinstance(m, AIMessage)
             for tc in (m.tool_calls or [])]
    return {"answer": final,
            "trace": trace,
            "sources": [t["result"] for t in trace]}


# --- 6. RUN IT (manual check) ------------------------------------------------
if __name__ == "__main__":
    question = "How much did we spend with Hanson PLC?. and what items did we buy"
    result = graph.invoke({"messages": [HumanMessage(content=question)]})
    # Print every message so you can SEE the loop: the question, the model's
    # tool-call requests, the tool results, then the final answer.
    for message in result["messages"]:
        message.pretty_print()