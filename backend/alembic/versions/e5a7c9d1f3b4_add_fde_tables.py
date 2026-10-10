"""add_fde_tables (service_plan 시드는 제안가 draft — SPEC 05 §7.2)

Revision ID: e5a7c9d1f3b4
Revises: d4f6b8c0e2a3
Create Date: 2026-10-11 00:00:00

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e5a7c9d1f3b4'
down_revision: Union[str, Sequence[str], None] = 'd4f6b8c0e2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    plan = op.create_table(
        'service_plan',
        sa.Column('plan_id', sa.String(40), nullable=False),
        sa.Column('product', sa.String(20), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False),
        sa.Column('name_ko', sa.String(100), nullable=False),
        sa.Column('name_en', sa.String(100), nullable=True),
        sa.Column('billing_kind', sa.String(30), nullable=False),
        sa.Column('unit', sa.String(10), nullable=False),
        sa.Column('list_price_supply', sa.BigInteger(), nullable=True),
        sa.Column('price_is_from', sa.Boolean(), nullable=False),
        sa.Column('price_status', sa.String(10), nullable=False),
        sa.Column('price_confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('confirmed_by_id', sa.BigInteger(), nullable=True),
        sa.Column('deposit_ratio', sa.Integer(), nullable=True),
        sa.Column('min_months', sa.Integer(), nullable=True),
        sa.Column('notice_days', sa.Integer(), nullable=True),
        sa.Column('applies_to', sa.String(200), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('contact_type', sa.String(20), nullable=True),
        sa.Column('linked_dev_plan', sa.String(20), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('plan_id'),
    )
    op.create_table(
        'fde_engagement',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.String(40), nullable=False),
        sa.Column('status', sa.String(12), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('min_end_date', sa.Date(), nullable=True),
        sa.Column('notice_received_at', sa.Date(), nullable=True),
        sa.Column('contract_price_supply', sa.BigInteger(), nullable=True),
        sa.Column('monthly_price_supply', sa.BigInteger(), nullable=True),
        sa.Column('headcount', sa.Integer(), nullable=False),
        sa.Column('engineer_ids', sa.String(200), nullable=True),
        sa.Column('predecessor_id', sa.Integer(), nullable=True),
        sa.Column('diagnosis_credit_supply', sa.BigInteger(), nullable=True),
        sa.Column('travel_expense_policy', sa.String(200), nullable=True),
        sa.Column('nda_signed_at', sa.Date(), nullable=True),
        sa.Column('ip_transfer_on_full_payment', sa.Boolean(), nullable=False),
        sa.Column('billing_day', sa.Integer(), nullable=True),
        sa.Column('source_estimate_id', sa.Integer(), nullable=True),
        sa.Column('source_lead_id', sa.Integer(), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('hcms_portal_opened_at', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fde_engagement_company_id', 'fde_engagement', ['company_id'])
    op.create_table(
        'fde_engagement_addon',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('engagement_id', sa.Integer(), nullable=False),
        sa.Column('plan_id', sa.String(40), nullable=False),
        sa.Column('qty', sa.Integer(), nullable=False),
        sa.Column('unit_price_supply', sa.BigInteger(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('dev_subscription_id', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_fde_engagement_addon_engagement_id', 'fde_engagement_addon', ['engagement_id'])

    now = datetime.now()
    base = dict(product='fde', price_status='draft', is_public=False, updated_at=now, name_en=None, deposit_ratio=None, min_months=None, description=None,
                notice_days=None, applies_to=None, contact_type=None, linked_dev_plan=None, price_is_from=False)
    rows = [
        dict(base, plan_id='fde-diagnosis', kind='plan', name_ko='FDE 진단', name_en='FDE Diagnosis', billing_kind='split_50_50', unit='once',
             list_price_supply=3000000, deposit_ratio=50, sort_order=1, contact_type='diagnosis',
             description='약 2주 · FDE 1명 · 인터뷰·점검 주 2~3회 · 현황 진단서, 개선안, 파일럿 범위·일정'),
        dict(base, plan_id='fde-pilot', kind='plan', name_ko='FDE 파일럿', name_en='FDE Pilot', billing_kind='split_50_50', unit='once',
             list_price_supply=12000000, price_is_from=True, deposit_ratio=50, sort_order=2, contact_type='pilot',
             description='4~6주 · FDE 1명(+지원 개발자) · 주 2회 + 원격 · 작동하는 소프트웨어 1건, 현장 배포, 결과 보고'),
        dict(base, plan_id='fde-resident', kind='plan', name_ko='FDE 상주', name_en='FDE Resident', billing_kind='monthly_prepaid', unit='month',
             list_price_supply=6500000, price_is_from=True, min_months=3, notice_days=30, sort_order=3, contact_type='resident',
             description='월 단위(최소 3개월) · FDE 1명 기준 · 주 2~3일 현장 + 원격 · 월간 개발·운영·개선, 월간 리포트'),
        dict(base, plan_id='fde-addon-engineer', kind='addon', name_ko='추가 FDE / 지원 개발자', billing_kind='monthly', unit='month',
             list_price_supply=4500000, price_is_from=True, applies_to='fde-resident', sort_order=11),
        dict(base, plan_id='fde-addon-extend', kind='addon', name_ko='파일럿 연장', billing_kind='per_week', unit='week',
             list_price_supply=2500000, applies_to='fde-pilot', sort_order=12, description='범위 변경 시 재견적'),
        dict(base, plan_id='fde-addon-handover', kind='addon', name_ko='이관 교육(내재화) 추가', billing_kind='one_time', unit='half_day',
             list_price_supply=800000, applies_to='fde-resident,fde-pilot', sort_order=13, description='상주 종료 시 기본 1회 포함'),
        dict(base, plan_id='fde-addon-ops', kind='addon', name_ko='이관 후 운영 지원', billing_kind='linked_subscription', unit='month',
             list_price_supply=None, applies_to='fde-resident,fde-pilot', sort_order=14,
             description='개발자 구독 플랜으로 연결 (정가/베타가 연결 기준은 미결 D14)'),
    ]
    op.bulk_insert(plan, rows)


def downgrade() -> None:
    op.drop_index('ix_fde_engagement_addon_engagement_id', table_name='fde_engagement_addon')
    op.drop_table('fde_engagement_addon')
    op.drop_index('ix_fde_engagement_company_id', table_name='fde_engagement')
    op.drop_table('fde_engagement')
    op.drop_table('service_plan')
