from datetime import date
from decimal import Decimal
from pydantic import BaseModel, field_validator, Field
from dateutil import parser as dateparser   # pip install python-dateutil


def _money(v):
    """'$ 192,81' / '7,50' → Decimal. None or '' → None (so missing data stays null)."""
    if v in (None, ""):
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    return Decimal(str(v).replace("$", "").replace(" ", "").replace(",", "."))


def normalize_date(raw) -> date | None:
    """Post-extraction step, NOT a validator. Call when mapping to your DB:
    normalize_date(invoice.header.invoice_date). dayfirst=False = US MM/DD/YYYY."""
    if raw in (None, ""):
        return None
    if isinstance(raw, date):
        return raw
    return dateparser.parse(raw, dayfirst=False).date()


class LineItem(BaseModel):
    item_desc: str
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


class Header(BaseModel):
    invoice_no: str
    invoice_date: str = Field(description="Copy the date exactly as printed, do not reformat")
    seller: str
    client: str
    seller_tax_id: str | None = None
    client_tax_id: str | None = None
    iban: str | None = None

class Summary(BaseModel):
    total_net_worth: Decimal
    total_vat: Decimal
    total_gross_worth: Decimal

    @field_validator("*", mode="before")
    @classmethod
    def _m(cls, v): return _money(v)


class Invoice(BaseModel):
    header: Header
    items: list[LineItem]
    summary: Summary