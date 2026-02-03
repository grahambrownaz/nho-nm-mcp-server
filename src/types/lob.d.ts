/**
 * Type declarations for the lob module
 */

declare module 'lob' {
  interface LobAddress {
    name?: string;
    company?: string;
    address_line1: string;
    address_line2?: string;
    address_city: string;
    address_state: string;
    address_zip: string;
    address_country?: string;
  }

  interface PostcardParams {
    description?: string;
    to: LobAddress;
    from: LobAddress;
    front: string;
    back?: string;
    size?: '4x6' | '6x9' | '6x11';
    mail_type?: 'usps_first_class' | 'usps_standard';
    merge_variables?: Record<string, unknown>;
    send_date?: string;
    metadata?: Record<string, string>;
  }

  interface Postcard {
    id: string;
    description?: string;
    to: LobAddress;
    from: LobAddress;
    url: string;
    carrier: string;
    tracking_number?: string;
    tracking_events?: Array<{
      type: string;
      name: string;
      time: string;
    }>;
    expected_delivery_date?: string;
    date_created: string;
    date_modified: string;
    send_date?: string;
  }

  interface PostcardsResource {
    create(
      params: PostcardParams,
      callback: (err: Error | null, postcard: Postcard) => void
    ): void;
    retrieve(
      id: string,
      callback: (err: Error | null, postcard: Postcard) => void
    ): void;
    list(
      params: { limit?: number; offset?: number; metadata?: Record<string, string> },
      callback: (err: Error | null, postcards: { data: Postcard[]; count: number }) => void
    ): void;
    delete(
      id: string,
      callback: (err: Error | null, result: { id: string; deleted: boolean }) => void
    ): void;
  }

  interface LobClient {
    postcards: PostcardsResource;
  }

  function Lob(apiKey: string): LobClient;

  export = Lob;
}
