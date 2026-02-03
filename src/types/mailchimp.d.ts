/**
 * Type declarations for @mailchimp/mailchimp_marketing
 */

declare module '@mailchimp/mailchimp_marketing' {
  interface Config {
    apiKey: string;
    server: string;
  }

  interface PingResponse {
    health_status?: string;
  }

  interface ListsResponse {
    lists?: Array<{
      id: string;
      name: string;
      stats?: {
        member_count?: number;
      };
    }>;
  }

  interface MergeFieldsResponse {
    merge_fields?: Array<{
      merge_id: number;
      tag: string;
      name: string;
      type: string;
      required: boolean;
    }>;
  }

  interface BatchResponse {
    id: string;
    status: string;
  }

  interface SetListMemberBody {
    email_address: string;
    status_if_new: string;
    merge_fields?: Record<string, string | number>;
  }

  const mailchimp: {
    setConfig(config: Config): void;
    ping: {
      get(): Promise<PingResponse>;
    };
    lists: {
      getAllLists(params?: { count?: number }): Promise<ListsResponse>;
      getListMergeFields(audienceId: string, params?: { count?: number }): Promise<MergeFieldsResponse>;
      setListMember(audienceId: string, subscriberHash: string, body: SetListMemberBody): Promise<unknown>;
    };
    batches: {
      start(params: { operations: Array<{ method: string; path: string; body: string }> }): Promise<BatchResponse>;
    };
  };

  export default mailchimp;
}
