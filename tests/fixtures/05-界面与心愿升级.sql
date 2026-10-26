-- 已有项目运行此脚本，更新商品编辑、删除和心愿归档权限，不清空任何记录。
begin;
create or replace function public.diary_save(p_revision bigint, p_commit_id uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r text := public.diary_role(); other_role text;
  h public.diary_house; x jsonb; old_x jsonb; item jsonb; ref text;
  old_user jsonb; new_user jsonb; old_set jsonb; new_set jsonb;
  author text; kind text; k text; allowed text[];
begin
  if r is null then raise exception 'DIARY_FORBIDDEN: 这个账号不在两人名单中'; end if;
  other_role := case when r='a' then 'b' else 'a' end;
  select * into strict h from public.diary_house where id=1 for update;
  if exists(select 1 from public.diary_commits where id=p_commit_id and user_id=auth.uid()) then
    return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
  end if;
  if p_revision is distinct from h.revision then
    return jsonb_build_object('conflict',true,'revision',h.revision,'role',r,'state',h.body);
  end if;
  if p_commit_id is null or p_state is null or jsonb_typeof(p_state)<>'object'
     or octet_length(p_state::text)>2097152 then
    raise exception 'DIARY_INVALID: 内容过大或格式不正确';
  end if;
  if (p_state - array['users','entries','products','notifications','since']) <>
     (h.body - array['users','entries','products','notifications','since']) then
    raise exception 'DIARY_INVALID: 不允许改变小屋身份或结构';
  end if;
  if jsonb_typeof(p_state->'users') is distinct from 'array' or jsonb_array_length(p_state->'users')<>2
     or jsonb_typeof(p_state->'entries') is distinct from 'array'
     or jsonb_typeof(p_state->'products') is distinct from 'array'
     or jsonb_typeof(p_state->'notifications') is distinct from 'array' then
    raise exception 'DIARY_INVALID: 记录格式不正确';
  end if;
  if jsonb_array_length(p_state->'entries')>5000 or jsonb_array_length(p_state->'products')>200
     or jsonb_array_length(p_state->'notifications')>2000 then
    raise exception 'DIARY_LIMIT: 请先导出归档，再整理较早的记录';
  end if;
  if coalesce(p_state->>'since','') !~ '^\d{4}-\d{2}-\d{2}$'
     or (p_state->>'since')::date > (now() at time zone 'Asia/Shanghai')::date then
    raise exception 'DIARY_INVALID: 请填写有效纪念日';
  end if;
  foreach k in array array['a','b'] loop
    select value into old_user from jsonb_array_elements(h.body->'users') where value->>'id'=k;
    select value into new_user from jsonb_array_elements(p_state->'users') where value->>'id'=k;
    if new_user is null or (new_user-array['name'])<>(old_user-array['name'])
       or (k<>r and new_user<>old_user) or length(coalesce(new_user->>'name','')) not between 1 and 20 then
      raise exception 'DIARY_FORBIDDEN: 只能修改自己的称呼';
    end if;
  end loop;
  foreach k in array array['entries','products','notifications'] loop
    new_set := p_state->k; old_set := h.body->k;
    if exists(select 1 from jsonb_array_elements(new_set) group by value->>'id' having count(*)>1) then
      raise exception 'DIARY_INVALID: 记录编号重复';
    end if;
    for x in select value from jsonb_array_elements(new_set) loop
      if jsonb_typeof(x)<>'object' or coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,90}$' then
        raise exception 'DIARY_INVALID: 记录编号不正确';
      end if;
      select value into old_x from jsonb_array_elements(old_set) where value->>'id'=x->>'id';
      if k='notifications' then
        if old_x is null then
          if x->>'actor' is distinct from r or x->>'recipient' is distinct from other_role
             or x->>'type' is null or x->>'type' not in ('order','moment','reaction','wish','fulfilled','product','plan')
             or length(coalesce(x->>'reaction',''))>200 or length(coalesce(x->>'mood',''))>20
         or length(coalesce(x->>'category',''))>20 then
            raise exception 'DIARY_INVALID: 提示信息不正确';
          end if;
        elsif x<>old_x and (old_x->>'recipient'<>r or (x-'dismissed')<>(old_x-'dismissed')) then
          raise exception 'DIARY_FORBIDDEN: 只能收起自己的提示';
        end if;
        continue;
      end if;
      if k='products' then
        if old_x is null and x->>'author' is distinct from r then
          raise exception 'DIARY_FORBIDDEN: 不能冒用另一半发布商品';
        end if;
        if old_x is not null and (x-array['name','note','icon','category','amount','url','deleted','updatedAt','editedBy'])<>
                                  (old_x-array['name','note','icon','category','amount','url','deleted','updatedAt','editedBy']) then
          raise exception 'DIARY_FORBIDDEN: 不能更改商品的创建归属';
        end if;
        if old_x is not null and x<>old_x and x->>'editedBy' is distinct from r then
          raise exception 'DIARY_FORBIDDEN: 请记录这次商品修改的成员';
        end if;
        if length(coalesce(x->>'name','')) not between 1 and 60
           or length(coalesce(x->>'note',''))>200 or length(coalesce(x->>'icon',''))>16
           or length(coalesce(x->>'category','')) not between 1 and 20
           or (x ? 'amount' and x->'amount'<>'null'::jsonb and
                (jsonb_typeof(x->'amount')<>'number' or (x->>'amount')::numeric<0 or (x->>'amount')::numeric>10000000))
           or (x ? 'deleted' and jsonb_typeof(x->'deleted')<>'boolean') then
          raise exception 'DIARY_INVALID: 商品内容或参考金额不正确';
        end if;
        if coalesce(x->>'url','')<>'' and (length(x->>'url')>2048 or x->>'url' !~* '^https?://[^[:space:]]+$' or x->>'url' ~ '[<>]') then
          raise exception 'DIARY_INVALID: 商品链接需使用有效的 http 或 https 地址';
        end if;
        continue;
      end if;
      author := x->>'author'; kind := x->>'kind';
      if kind is null or kind not in ('order','memory','plan','wish','moment')
         or author is null or author not in ('a','b')
         or length(coalesce(x->>'title','')) not between 1 and 800
         or length(coalesce(x->>'content',''))>2000 or length(coalesce(x->>'place',''))>80
         or length(coalesce(x->>'reaction',''))>200 or length(coalesce(x->>'mood',''))>20
         or length(coalesce(x->>'category',''))>20 then
        raise exception 'DIARY_INVALID: 记录内容不正确';
      end if;
      if old_x is null and author<>r then raise exception 'DIARY_FORBIDDEN: 不能代替他发表记录'; end if;
      if old_x is not null and (x->'author' is distinct from old_x->'author'
         or x->'kind' is distinct from old_x->'kind' or x->'createdAt' is distinct from old_x->'createdAt') then
        raise exception 'DIARY_FORBIDDEN: 不允许修改记录归属';
      end if;
      if old_x is not null and author<>r and kind<>'plan' and x<>old_x then
        allowed := array['linkedId','status'];
        if kind in ('order','moment') then allowed := allowed || array['reaction','reactionAt','reactionBy','receivedAt']; end if;
        if kind='wish' and x->>'wishType'='physical' then allowed := allowed || array['fulfilledBy','fulfilledAt']; end if;
        if (x-allowed)<>(old_x-allowed)
           or (x ? 'reactionBy' and x->>'reactionBy' is distinct from r)
           or (x ? 'fulfilledBy' and x->>'fulfilledBy' is distinct from r) then
          raise exception 'DIARY_FORBIDDEN: 不能改写他的记录，只能回应或实现心愿';
        end if;
      end if;
      if kind='order' then
        if x->>'recipient' is distinct from (case when author='a' then 'b' else 'a' end)
           or coalesce((x->>'total')::numeric,-1)<>0 or jsonb_typeof(x->'items') is distinct from 'array'
           or jsonb_array_length(x->'items') not between 1 and 30 then
          raise exception 'DIARY_INVALID: 订单必须是两人之间的零元心意';
        end if;
        for item in select value from jsonb_array_elements(x->'items') loop
          if coalesce((item->>'quantity')::integer,0) not between 1 and 9
             or coalesce((item->>'price')::numeric,-1)<>0 then
            raise exception 'DIARY_INVALID: 商品数量或价格不正确';
          end if;
        end loop;
        if old_x is not null and (x-array['reaction','reactionAt','reactionBy','receivedAt','status'])<>
                                  (old_x-array['reaction','reactionAt','reactionBy','receivedAt','status']) then
          raise exception 'DIARY_FORBIDDEN: 已发送订单不能更改内容';
        end if;
      end if;
      if kind in ('memory','plan') then
        if coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'DIARY_INVALID: 请选择日期'; end if;
        if kind='memory' and (x->>'date')::date>(now() at time zone 'Asia/Shanghai')::date then
          raise exception 'DIARY_INVALID: 回忆不能使用未来日期';
        end if;
      end if;
      if x ? 'budget' and ((x->>'budget')::numeric<0 or (x->>'budget')::numeric>10000000) then
        raise exception 'DIARY_INVALID: 预算不正确';
      end if;
      if x ? 'photos' then
        if jsonb_typeof(x->'photos') is distinct from 'array' or jsonb_array_length(x->'photos')>6 then
          raise exception 'DIARY_INVALID: 每条记录最多六张照片';
        end if;
        for ref in select jsonb_array_elements_text(x->'photos') loop
          if ref !~ '^storage:[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
             or not exists(select 1 from storage.objects o join public.diary_members m on m.user_id::text=split_part(o.name,'/',1)
               where o.bucket_id='diary-photos' and o.name=substring(ref from 9)) then
            raise exception 'DIARY_INVALID: 照片不属于这个小屋或未上传完成';
          end if;
        end loop;
      end if;
    end loop;
    for old_x in select value from jsonb_array_elements(old_set) loop
      if not exists(select 1 from jsonb_array_elements(new_set) where value->>'id'=old_x->>'id') then
        if k='products' or (k='entries' and old_x->>'author'<>r and not (
             old_x->>'kind'='wish' and exists(select 1 from jsonb_array_elements(p_state->'entries') m
               where m->>'kind'='memory' and m->>'author'=r and m->>'fulfilledBy'=r
                 and m->>'sourceWishId'=old_x->>'id' and m->>'wishAuthor'=old_x->>'author'
                 and m->>'title'=old_x->>'title'
                 and coalesce(m->>'content','')=coalesce(old_x->>'content','')
                 and coalesce(m->>'place','')=coalesce(old_x->>'place','')
                 and coalesce(m->'photos','[]'::jsonb)=coalesce(old_x->'photos','[]'::jsonb))
           ))
           or (k='notifications' and (old_x->>'recipient'<>r or coalesce((old_x->>'expiresAt')::numeric,0)>extract(epoch from now())*1000)) then
          raise exception 'DIARY_FORBIDDEN: 不能删除他的记录或未过期提示';
        end if;
      end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'entries') e
    where e->>'kind'='memory' and coalesce(e->>'sourceWishId','')<>''
    group by e->>'sourceWishId' having count(*)>1) then
    raise exception 'DIARY_INVALID: 一个心愿只能归档一次';
  end if;
  update public.diary_house set body=p_state,revision=revision+1,updated_at=now() where id=1 returning * into h;
  insert into public.diary_commits(id,user_id) values(p_commit_id,auth.uid());
  delete from public.diary_commits where created_at<now()-interval '30 days';
  return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
end $$;
revoke all on function public.diary_save(bigint,uuid,jsonb) from public;
grant execute on function public.diary_save(bigint,uuid,jsonb) to authenticated;
-- 将旧版用户添加的“实物”商品移至心愿；既有订单快照不改动。
update public.diary_house h set body=jsonb_set(h.body,'{entries}',
  (h.body->'entries')||coalesce((select jsonb_agg(jsonb_build_object(
    'id','migrated-'||substr(md5(p->>'id'),1,24),'kind','wish','wishType','physical','category','物品',
    'title',p->>'name','content',coalesce(p->>'note',''),'author',p->>'author',
    'createdAt',coalesce((p->>'createdAt')::numeric,extract(epoch from now())*1000),
    'status','active','photos','[]'::jsonb,'sourceProductId',p->>'id'))
    from jsonb_array_elements(h.body->'products') p where p->>'category'='实物' and coalesce((p->>'deleted')::boolean,false)=false
      and not exists(select 1 from jsonb_array_elements(h.body->'entries') e where e->>'sourceProductId'=p->>'id')),'[]'::jsonb)),
  revision=revision+1,updated_at=now()
where exists(select 1 from jsonb_array_elements(h.body->'products') p where p->>'category'='实物' and coalesce((p->>'deleted')::boolean,false)=false
  and not exists(select 1 from jsonb_array_elements(h.body->'entries') e where e->>'sourceProductId'=p->>'id'));
-- 保留原商品作为历史快照依据，但标为移出小铺，避免心愿实现/删除后重跑迁移又复活。
update public.diary_house h set body=jsonb_set(h.body,'{products}',
  (select jsonb_agg(case when p->>'category'='实物' then p||jsonb_build_object('deleted',true) else p end)
   from jsonb_array_elements(h.body->'products') p)),revision=revision+1,updated_at=now()
where exists(select 1 from jsonb_array_elements(h.body->'products') p
  where p->>'category'='实物' and coalesce((p->>'deleted')::boolean,false)=false);
commit;
