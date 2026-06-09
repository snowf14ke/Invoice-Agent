"""
Shared agent core — a LangGraph ReAct loop + tool interface.

This is the reusable heart that BOTH the document agent and the PR assistant
sit on. The agent loop and the tool interface never change; only the tool
bodies (and later, where they read data from) do.

Run it (needs GEMINI_KEY + SUPABASE_URI + OPEN_AI_API in .env, and a populated DB —
run `python ingest.py` for the smoke set or prepare_db.ipynb for the real data):
    python agent_core.py
"""

from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, START, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition
import os 
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('GEMINI_KEY')
# --- 1. TOOLS ----------------------------------------------------------------
# The tool seam: identical names/docstrings/signatures to the old stubs, but the
# bodies now read live Supabase data on the `documents` schema. The agent loop,
# the graph, and the model's tool-routing don't change — see tools.py / db.py.
from tools import TOOLS


# --- 2. THE MODEL, WITH TOOLS BOUND ------------------------------------------
# bind_tools() hands the tool schemas to the model so it CAN request a call.
# Important: the model never runs a tool. It only emits a request ("call
# query_fields with vendor='Acme'"); YOUR code (the ToolNode below) runs it.
# llm = ChatAnthropic(model="claude-opus-4-8", temperature=0)
# llm = ChatAnthropic(model="claude-haiku-4-5-20251001", temperature=0)
llm = ChatGoogleGenerativeAI(
    model="gemini-3.5-flash",          # valid current id (the dubious gemini-3.5-flash isn't)
    temperature=0,
    max_retries=2,
    google_api_key=api_key,
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


# --- 5. RUN IT ---------------------------------------------------------------
if __name__ == "__main__":
    question = "How much did we spend with Acme, and is invoice INV-1002 consistent?"
    result = graph.invoke({"messages": [HumanMessage(content=question)]})
    # Print every message so you can SEE the loop: the question, the model's
    # tool-call requests, the tool results, then the final answer.
    for message in result["messages"]:
        message.pretty_print()