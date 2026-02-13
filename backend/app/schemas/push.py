from pydantic import BaseModel


class PushTokenRegister(BaseModel):
    token: str
    platform: str  # "ios" | "android"
    device_id: str | None = None


class PushTokenResponse(BaseModel):
    id: int
    token: str
    platform: str
    is_active: bool

    model_config = {"from_attributes": True}


class PushSendRequest(BaseModel):
    title: str
    body: str
    manager_seq: int | None = None  # None이면 전체 발송
    data: dict | None = None
