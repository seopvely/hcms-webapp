from pydantic import BaseModel


class LoginRequest(BaseModel):
    site_key: str | None = None
    login_id: str
    password: str


class UserResponse(BaseModel):
    seq: int
    login_id: str
    name: str | None
    email: str | None
    company_name: str | None
    company_id: int | None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserResponse
    is_first_login: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str
