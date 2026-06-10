from datetime import date
from decimal import Decimal
from pydantic import BaseModel, field_validator, Field
from dateutil import parser as dateparser   # pip install python-dateutil


def _money(v):
    """'$ 192,81' / '7,50' / '24,173.78' → Decimal. None or '' → None (missing stays null).
    Documents mix separator conventions: European decimal comma ('192,81') and US
    thousands comma ('24,173.78' — a blind ,→. swap made '24.173.78', which is why
    ds_132/ds_134 failed to ingest). If both separators appear, the last one is the
    decimal point; a lone comma is treated as a decimal comma."""
    if v in (None, ""):
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = str(v).replace("$", "").replace(" ", "")
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):       # '1.234,56' -> European
            s = s.replace(".", "").replace(",", ".")
        else:                                 # '24,173.78' -> US
            s = s.replace(",", "")
    elif "," in s:                            # '7,50' or '24,173,78' (comma as both
        head, _, tail = s.rpartition(",")     #  thousands and decimal separator):
        s = head.replace(",", "") + "." + tail  # last comma is the decimal point
    elif s.count(".") > 1:                    # '24.173.78'
        head, _, tail = s.rpartition(".")
        s = head.replace(".", "") + "." + tail
    return Decimal(s)


def normalize_date(raw) -> date | None:
    """Post-extraction step, NOT a validator. Call when mapping to your DB:
    normalize_date(invoice.header.invoice_date). dayfirst=False = US MM/DD/YYYY."""
    if raw in (None, ""):
        return None
    if isinstance(raw, date):
        return raw
    try:
        return dateparser.parse(raw, dayfirst=False).date()
    except (ValueError, OverflowError, TypeError):
        return None   # unparseable OCR date -> store null, don't crash the row


class LineItem(BaseModel):
    item_desc: str | None = None
    item_qty: int | None = Field(
        None,
        description="Quantity from the Qty column only. Null if the row has no quantity. Never take a number from the description.",
    )
    item_net_price: Decimal | None = None
    item_net_worth: Decimal | None = None
    item_vat: str | None = None            # "10%" — left as string
    item_gross_worth: Decimal | None = None

    @field_validator("item_net_price", "item_net_worth", "item_gross_worth", mode="before")
    @classmethod
    def _m(cls, v): return _money(v)

    @field_validator("item_qty", mode="before")
    @classmethod
    def _q(cls, v):
        m = _money(v)
        return int(m) if m is not None else None


# Every field is Optional on purpose: the dataset mixes invoices and receipts, and
# receipts often lack an invoice number, a named client, tax ids, or a net/VAT
# breakdown. Making these required made instructor retry then crash on those docs.
# Optional => the model fills what exists and leaves the rest null, so a receipt
# ingests cleanly (with nulls) instead of throwing. The DB columns are nullable too.
class Header(BaseModel):
    invoice_no: str | None = None
    invoice_date: str | None = Field(None, description="Copy the date exactly as printed, do not reformat")
    seller: str | None = None
    client: str | None = None
    seller_tax_id: str | None = None
    client_tax_id: str | None = None
    iban: str | None = None

    # The LLM sometimes returns "" instead of null; store that as NULL in the DB
    # (an empty-string invoice_number breaks IS NULL checks and unique lookups).
    @field_validator("*", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        return None if isinstance(v, str) and not v.strip() else v

class Summary(BaseModel):
    total_net_worth: Decimal | None = None
    total_vat: Decimal | None = None
    total_gross_worth: Decimal | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _m(cls, v): return _money(v)


class Invoice(BaseModel):
    # Defaults let a document validate even if a whole section is absent.
    header: Header = Field(default_factory=Header)
    items: list[LineItem] = Field(default_factory=list)
    summary: Summary = Field(default_factory=Summary)